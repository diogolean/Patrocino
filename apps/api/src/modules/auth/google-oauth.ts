import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hash } from "bcryptjs";
import { legalConfig } from "@mimelux/core/legal";
import { safeReturnPath } from "@mimelux/core/return-path";
import { database } from "@mimelux/db/runtime";
import { rememberReferral } from "../affiliates/tracking";

export const GOOGLE_CALLBACK_URL = "https://patrocino.com/v1/auth/google/callback";
export const GOOGLE_SCOPES = "openid email profile";

export type GoogleEnv = NodeJS.ProcessEnv;

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

export type GoogleState = {
  next: string | null;
  role: "FAN" | "CREATOR" | "AFFILIATE";
  clickId: string | null;
  exp: number;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function googleConfigured(env: GoogleEnv = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleRedirectUri(env: GoogleEnv = process.env) {
  return env.GOOGLE_REDIRECT_URI?.trim() || GOOGLE_CALLBACK_URL;
}

export function googleAuthorizeUrl(input: { clientId: string; state: string; redirectUri?: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri ?? GOOGLE_CALLBACK_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("state", input.state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

function stateSecret(env: GoogleEnv) {
  return env.JWT_ACCESS_SECRET?.trim() || "local-access-only";
}

export function signGoogleState(state: Omit<GoogleState, "exp"> & { exp?: number }, env: GoogleEnv = process.env, now = Date.now()) {
  const payload: GoogleState = {
    next: safeReturnPath(state.next),
    role: state.role,
    clickId: state.clickId,
    exp: state.exp ?? now + 10 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateSecret(env)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readGoogleState(token: string, env: GoogleEnv = process.env, now = Date.now()): GoogleState | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateSecret(env)).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleState;
    if (!payload.exp || payload.exp < now) return null;
    if (payload.role !== "FAN" && payload.role !== "CREATOR" && payload.role !== "AFFILIATE") return null;
    return { ...payload, next: safeReturnPath(payload.next), clickId: payload.clickId || null };
  } catch {
    return null;
  }
}

export function profileFromGoogle(payload: unknown): GoogleProfile | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown; given_name?: unknown };
  const sub = typeof row.sub === "string" ? row.sub.trim() : "";
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  const name = (typeof row.name === "string" && row.name.trim()) || (typeof row.given_name === "string" && row.given_name.trim()) || "Google";
  if (!sub || !email || !email.includes("@")) return null;
  return { sub, email, emailVerified: row.email_verified === true, name: name.slice(0, 80) };
}

export async function fetchGoogleProfile(input: {
  code: string;
  env?: GoogleEnv;
  fetchImpl?: FetchLike;
}): Promise<GoogleProfile | null> {
  const env = input.env ?? process.env;
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  const fetchImpl = input.fetchImpl ?? fetch;
  const redirectUri = googleRedirectUri(env);
  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return null;
  const token = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null;
  if (!token?.access_token) return null;
  const profileResponse = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) return null;
  return profileFromGoogle(await profileResponse.json().catch(() => null));
}

export async function accountForGoogleProfile(profile: GoogleProfile, state: GoogleState) {
  if (!profile.emailVerified) return { error: "unverified_email" as const };
  const bySub = await database.user.findUnique({ where: { googleSub: profile.sub } });
  if (bySub && !bySub.deletedAt && !bySub.suspendedAt) {
    if (state.clickId) await rememberReferral(bySub.id, state.clickId);
    return { error: null, user: bySub, created: false };
  }
  const byEmail = await database.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    if (byEmail.deletedAt || byEmail.suspendedAt) return { error: "unavailable" as const };
    if (!byEmail.emailVerifiedAt) return { error: "unverified_account" as const };
    if (byEmail.googleSub && byEmail.googleSub !== profile.sub) return { error: "unavailable" as const };
    const linked = await database.user.update({
      where: { id: byEmail.id },
      data: { googleSub: profile.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() },
    });
    if (state.clickId) await rememberReferral(linked.id, state.clickId);
    return { error: null, user: linked, created: false };
  }
  const created = await database.user.create({
    data: {
      email: profile.email,
      passwordHash: await hash(randomBytes(24).toString("base64url"), 12),
      role: state.role,
      emailVerifiedAt: new Date(),
      googleSub: profile.sub,
      acceptedTermsAt: new Date(),
      termsVersion: legalConfig.termsVersion,
      profile: {
        create: {
          name: profile.name,
          username: `g-${randomBytes(5).toString("hex")}`,
        },
      },
    },
  });
  if (state.clickId) await rememberReferral(created.id, state.clickId);
  return { error: null, user: created, created: true };
}
