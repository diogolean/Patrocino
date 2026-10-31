import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Module,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { legalConfig } from "@mimelux/core/legal";
import { safeReturnPath } from "@mimelux/core/return-path";
import { Prisma, database } from "@mimelux/db/runtime";
import type { Request, Response } from "express";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { sign, verify } from "jsonwebtoken";
import { z } from "zod";
import { resolveClientIp } from "./client-ip";
import { createEmailSender } from "./email-sender";
import { localeFromAcceptLanguage, normalizeUserLocale } from "./user-locale";
import { apiError } from "../../http/api-error";
import { rememberReferral } from "../affiliates/tracking";
import {
  accountForGoogleProfile,
  fetchGoogleProfile,
  googleAuthorizeUrl,
  googleConfigured,
  googleRedirectUri,
  readGoogleState,
  signGoogleState,
} from "./google-oauth";
import { clearEmailLoginFailures, emailLoginBlocked, recordEmailLoginFailure } from "./login-failures";
import { AvatarTooLargeError, readAvatarBody, readAvatarImage, renderAvatarJpeg } from "./avatar";
import { openStorage } from "../media/storage";
import { requireUser } from "./require-user";

const demoEmailAliases: Record<string, string> = {
  "creator@mimelux.com.br": "criadora@mimelux.com.br",
  "creator@patrocino.com": "criadora@mimelux.com.br",
  "criadora@patrocino.com": "criadora@mimelux.com.br",
  "fan@patrocino.com": "fan@mimelux.com.br",
  "afiliado@patrocino.com": "afiliado@mimelux.com.br",
  "creator@fanmimo.com": "criadora@mimelux.com.br",
  "creator@fanmimo.com.br": "criadora@mimelux.com.br",
  "criadora@fanmimo.com": "criadora@mimelux.com.br",
  "criadora@fanmimo.com.br": "criadora@mimelux.com.br",
  "fan@fanmimo.com": "fan@mimelux.com.br",
  "fan@fanmimo.com.br": "fan@mimelux.com.br",
  "afiliado@fanmimo.com": "afiliado@mimelux.com.br",
  "afiliado@fanmimo.com.br": "afiliado@mimelux.com.br",
};

function canonicalDemoEmail(email: string) {
  const value = email.trim().toLowerCase();
  return demoEmailAliases[value] ?? value;
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(6).max(120),
});
const registerSchema = credentialsSchema.extend({
  name: z.string().min(2).max(80),
  role: z.enum(["FAN", "CREATOR", "AFFILIATE"]).default("FAN"),
  acceptTerms: z.literal(true),
  acceptCreatorTerms: z.boolean().optional(),
  locale: z.string().max(12).optional(),
  next: z.string().max(2048).optional(),
  clickId: z.string().max(80).optional(),
});
const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const verifySchema = z.object({ token: z.string().min(20) });

type AccountUser = {
  id: string;
  email: string;
  role: string;
  emailVerifiedAt: Date | null;
  profile?: { name: string; username: string; avatarUrl: string | null } | null;
};

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw apiError(400, "INVALID_REQUEST", result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function publicUser(user: AccountUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    name: user.profile?.name ?? "",
    username: user.profile?.username ?? "",
    avatarUrl: user.profile?.avatarUrl ?? null,
  };
}

function issueTokens(user: AccountUser) {
  const accessSecret = process.env.JWT_ACCESS_SECRET ?? "local-access-only";
  const refreshSecret = process.env.JWT_REFRESH_SECRET ?? "local-refresh-only";
  return {
    accessToken: sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
      accessSecret,
      { expiresIn: "15m" },
    ),
    refreshToken: sign(
      { sub: user.id, type: "refresh", jti: randomBytes(16).toString("hex") },
      refreshSecret,
      { expiresIn: "30d" },
    ),
    tokenType: "Bearer",
    expiresIn: 900,
  };
}

async function persistSession(user: AccountUser) {
  const tokens = issueTokens(user);
  const saved = await database.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: tokenHash(tokens.refreshToken) },
    include: { profile: true },
  });
  return { user: publicUser(saved), ...tokens };
}

type SessionPayload = Awaited<ReturnType<typeof persistSession>>;

const refreshFlights = new Map<string, { tokenHash: string; promise: Promise<SessionPayload> }>();

async function rotateRefresh(refreshToken: string): Promise<SessionPayload> {
  const payload = verify(refreshToken, process.env.JWT_REFRESH_SECRET ?? "local-refresh-only") as {
    sub?: string;
    type?: string;
  };
  if (payload.type !== "refresh" || !payload.sub) throw new Error("Invalid token type");
  const digest = tokenHash(refreshToken);
  const current = refreshFlights.get(payload.sub);
  if (current) {
    if (current.tokenHash !== digest) throw new Error("Refresh token reuse");
    return current.promise;
  }
  const promise = (async () => {
    const user = await database.user.findUnique({ where: { id: payload.sub } });
    if (!user?.refreshTokenHash || user.refreshTokenHash !== digest) {
      throw new Error("Refresh token reuse");
    }
    return persistSession(user);
  })();
  refreshFlights.set(payload.sub, { tokenHash: digest, promise });
  try {
    return await promise;
  } finally {
    refreshFlights.delete(payload.sub);
  }
}

async function sendVerification(user: { id: string; email: string; locale?: string | null }, next: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await database.user.update({
    where: { id: user.id },
    data: {
      emailVerificationTokenHash: tokenHash(token),
      emailVerificationExpiresAt: expiresAt,
    },
  });
  const origin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:3333";
  const params = new URLSearchParams({ token });
  if (next) params.set("next", next);
  const link = `${origin}/api/session/verify?${params.toString()}`;
  try {
    await createEmailSender().sendVerification(user.email, link, user.locale);
  } catch (error) {
    console.error("[patrocino] verification email failed; logging the link instead");
    console.log(`[patrocino] verification link for ${user.email}: ${link}`);
    console.error(error);
  }
}

@ApiTags("auth")
@Controller("auth")
class AuthController {
  @Get("me")
  @ApiOperation({ summary: "Return the account for a valid access token" })
  async me(@Headers("authorization") authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) throw apiError(401, "MISSING_ACCESS_TOKEN", "Missing access token");
    try {
      const payload = verify(token, process.env.JWT_ACCESS_SECRET ?? "local-access-only") as {
        sub?: string;
        email?: string;
        role?: string;
        emailVerified?: boolean;
      };
      if (!payload.sub || !payload.email || !payload.role) throw new Error("Incomplete token");
      const record = await database.user.findUnique({
        where: { id: payload.sub },
        include: { profile: true },
      });
      if (!record || record.deletedAt || record.suspendedAt) throw new Error("Missing account");
      return { user: publicUser(record) };
    } catch {
      throw apiError(401, "INVALID_ACCESS_TOKEN", "Invalid access token");
    }
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: "Authenticate with credentials and return native-ready tokens" })
  async login(@Body() body: unknown) {
    const input = parseBody(credentialsSchema, body);
    const email = canonicalDemoEmail(input.email);
    if (emailLoginBlocked(email)) {
      throw apiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts");
    }
    const user = await database.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || user.suspendedAt || !(await compare(input.password, user.passwordHash))) {
      recordEmailLoginFailure(email);
      throw apiError(401, "INVALID_CREDENTIALS", "Invalid credentials");
    }
    clearEmailLoginFailures(email);
    return persistSession(user);
  }

  @Post("register")
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: "Register a user and return a token pair" })
  async register(
    @Body() body: unknown,
    @Req() request: Request,
    @Headers("accept-language") acceptLanguage?: string,
    @Headers("x-patrocino-click") clickHeader?: string,
  ) {
    const input = parseBody(registerSchema, body);
    if (input.role !== "FAN" && input.role !== "CREATOR" && input.role !== "AFFILIATE") {
      throw apiError(400, "ROLE_IS_NOT_ALLOWED", "Role is not allowed");
    }
    if (input.role === "CREATOR" && input.acceptCreatorTerms !== true) {
      throw apiError(400, "CREATOR_TERMS_ARE_REQUIRED", "Creator terms are required");
    }
    const email = canonicalDemoEmail(input.email);
    try {
      const user = await database.user.create({
        data: {
          email,
          passwordHash: await hash(input.password, 12),
          role: input.role,
          acceptedTermsAt: new Date(),
          termsVersion: legalConfig.termsVersion,
          acceptedTermsIp: resolveClientIp(request),
          locale: normalizeUserLocale(input.locale) ?? localeFromAcceptLanguage(acceptLanguage) ?? "pt-BR",
          profile: {
            create: {
              name: input.name,
              username: `user-${randomBytes(6).toString("hex")}`,
            },
          },
        },
      });
      await sendVerification(user, safeReturnPath(input.next));
      const clickId = input.clickId || clickHeader;
      if (clickId) await rememberReferral(user.id, clickId);
      return persistSession(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw apiError(409, "EMAIL_ALREADY_REGISTERED", "Email already registered");
      }
      throw error;
    }
  }

  @Post("refresh")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async refresh(@Body() body: unknown) {
    const { refreshToken } = parseBody(refreshSchema, body);
    try {
      return await rotateRefresh(refreshToken);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw apiError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
    }
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async logout(@Body() body: unknown) {
    const { refreshToken } = parseBody(refreshSchema, body);
    try {
      const payload = verify(refreshToken, process.env.JWT_REFRESH_SECRET ?? "local-refresh-only") as {
        sub?: string;
        type?: string;
      };
      if (payload.type === "refresh" && payload.sub) {
        const user = await database.user.findUnique({ where: { id: payload.sub } });
        if (user?.refreshTokenHash === tokenHash(refreshToken)) {
          await database.user.update({
            where: { id: user.id },
            data: { refreshTokenHash: null },
          });
        }
      }
    } catch {
      return { loggedOut: true };
    }
    return { loggedOut: true };
  }

  @Post("locale")
  @HttpCode(200)
  @ApiOperation({ summary: "Store the language chosen by the signed-in account" })
  async setLocale(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) throw apiError(401, "MISSING_ACCESS_TOKEN", "Missing access token");
    let userId = "";
    try {
      const payload = verify(token, process.env.JWT_ACCESS_SECRET ?? "local-access-only") as { sub?: string };
      if (!payload.sub) throw new Error("Incomplete token");
      userId = payload.sub;
    } catch {
      throw apiError(401, "INVALID_ACCESS_TOKEN", "Invalid access token");
    }
    const parsed = z.object({ locale: z.string().min(2).max(12) }).safeParse(body);
    const locale = parsed.success ? normalizeUserLocale(parsed.data.locale) : null;
    if (!locale) throw apiError(400, "INVALID_LOCALE", "Locale is not supported");
    await database.user.update({ where: { id: userId }, data: { locale } });
    return { locale };
  }

  @Post("verify-email")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: "Confirm an email verification token" })
  async verifyEmail(@Body() body: unknown) {
    const { token } = parseBody(verifySchema, body);
    const user = await database.user.findFirst({
      where: { emailVerificationTokenHash: tokenHash(token) },
    });
    if (!user?.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) {
      throw apiError(401, "INVALID_VERIFICATION_TOKEN", "Invalid verification token");
    }
    const verified = await database.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });
    return { user: publicUser(verified) };
  }

  @Post("avatar")
  @HttpCode(200)
  @ApiOperation({ summary: "Upload a square profile photo" })
  async avatar(@Headers("authorization") authorization: string | undefined, @Req() request: Request) {
    const user = await requireUser(authorization);
    let body: Buffer;
    try {
      body = await readAvatarBody(request);
    } catch (error) {
      if (error instanceof AvatarTooLargeError) throw apiError(413, "AVATAR_TOO_LARGE", "Avatar is too large");
      throw error;
    }
    const image = readAvatarImage(body);
    if (image.error === "AVATAR_TOO_LARGE") throw apiError(413, "AVATAR_TOO_LARGE", "Avatar is too large");
    if (image.error) throw apiError(400, "AVATAR_INVALID", "Send a JPEG, PNG, or WebP image");
    let jpeg: Buffer;
    try {
      jpeg = await renderAvatarJpeg(body);
    } catch {
      throw apiError(400, "AVATAR_FAILED", "Could not process the image");
    }
    const storage = await openStorage();
    await storage.write(`avatars/${user.id}.jpg`, jpeg);
    const avatarUrl = `/media/avatars/${user.id}.jpg?v=${Date.now()}`;
    const existing = await database.profile.findUnique({ where: { userId: user.id } });
    if (existing) {
      await database.profile.update({ where: { userId: user.id }, data: { avatarUrl } });
    } else {
      const local = user.email.split("@")[0]?.slice(0, 80) || "Patrocino";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await database.profile.create({
            data: {
              userId: user.id,
              name: local,
              username: `user-${randomBytes(6).toString("hex")}`,
              avatarUrl,
            },
          });
          break;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 2) continue;
          throw error;
        }
      }
    }
    const record = await database.user.findUnique({ where: { id: user.id }, include: { profile: true } });
    if (!record) throw apiError(401, "INVALID_ACCESS_TOKEN", "Invalid access token");
    return { user: publicUser(record) };
  }

  @Get("google")
  @ApiOperation({ summary: "Whether Google sign-in is configured" })
  googleStatus() {
    return { enabled: googleConfigured() };
  }

  @Get("google/start")
  @ApiOperation({ summary: "Redirect the browser to Google" })
  googleStart(
    @Query("next") next: string | undefined,
    @Query("role") role: string | undefined,
    @Query("clickId") clickId: string | undefined,
    @Res() response: Response,
  ) {
    if (!googleConfigured()) {
      response.status(404).json({ enabled: false });
      return;
    }
    const accountRole = role === "CREATOR" || role === "AFFILIATE" ? role : "FAN";
    const state = signGoogleState({
      next: next ?? null,
      role: accountRole,
      clickId: clickId ?? null,
    });
    response.redirect(googleAuthorizeUrl({
      clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
      state,
      redirectUri: googleRedirectUri(),
    }));
  }

  @Get("google/callback")
  @ApiOperation({ summary: "Google OAuth callback" })
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() response: Response,
  ) {
    const origin = (process.env.WEB_ORIGIN ?? "http://127.0.0.1:3333").replace(/\/$/, "");
    const fail = (reason: string) => {
      response.redirect(`${origin}/auth?route=sign-in&google=${encodeURIComponent(reason)}`);
    };
    if (!googleConfigured() || !code || !state) return fail("unavailable");
    const parsed = readGoogleState(state);
    if (!parsed) return fail("state");
    const profile = await fetchGoogleProfile({ code });
    if (!profile) return fail("profile");
    const account = await accountForGoogleProfile(profile, parsed);
    if (account.error || !account.user) return fail(account.error ?? "profile");
    const session = await persistSession(account.user);
    const secure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
    const common = `HttpOnly; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
    response.append("Set-Cookie", `patrocino_access=${session.accessToken}; Max-Age=900; ${common}`);
    response.append("Set-Cookie", `patrocino_refresh=${session.refreshToken}; Max-Age=2592000; ${common}`);
    const next = parsed.next ?? (account.user.role === "CREATOR" ? "/painel" : account.user.role === "AFFILIATE" ? "/afiliados" : "/topcreators");
    response.redirect(`${origin}${next}`);
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      getTracker: (req) => resolveClientIp(req),
      throttlers: [
        {
          ttl: Number(process.env.AUTH_RATE_TTL_MS ?? 60_000),
          limit: Number(
            process.env.AUTH_RATE_LIMIT ?? (process.env.NODE_ENV === "production" ? 10 : 120),
          ),
        },
      ],
    }),
  ],
  controllers: [AuthController],
})
export class AuthModule {}
