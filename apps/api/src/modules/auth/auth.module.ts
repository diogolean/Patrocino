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
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { legalConfig } from "@mimelux/core/legal";
import { safeReturnPath } from "@mimelux/core/return-path";
import { Prisma, database } from "@mimelux/db/runtime";
import type { Request } from "express";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { sign, verify } from "jsonwebtoken";
import { z } from "zod";
import { resolveClientIp } from "./client-ip";
import { createEmailSender } from "./email-sender";
import { localeFromAcceptLanguage, normalizeUserLocale } from "./user-locale";
import { apiError } from "../../http/api-error";
import { clearEmailLoginFailures, emailLoginBlocked, recordEmailLoginFailure } from "./login-failures";

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
});
const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const verifySchema = z.object({ token: z.string().min(20) });

type AccountUser = {
  id: string;
  email: string;
  role: string;
  emailVerifiedAt: Date | null;
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
  await database.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: tokenHash(tokens.refreshToken) },
  });
  return { user: publicUser(user), ...tokens };
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
      return {
        user: {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          emailVerified: Boolean(payload.emailVerified),
        },
      };
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
  async register(@Body() body: unknown, @Req() request: Request, @Headers("accept-language") acceptLanguage?: string) {
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
