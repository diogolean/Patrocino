import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { AccountRole } from "@mimelux/core";
import { apiAuth, authErrorMessage, toApiRole, toSessionUser } from "@/lib/api-auth";
import { applyAuthCookies } from "@/lib/session-cookies";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    provider?: string;
    role?: AccountRole;
    acceptTerms?: boolean;
    acceptCreatorTerms?: boolean;
  } | null;
  const provider = (body?.provider ?? "social").toLowerCase().replace(/[^a-z0-9]+/g, "") || "social";
  const email = `${provider}.${randomBytes(6).toString("hex")}@mimelux.test`;
  const { response, data } = await apiAuth("/auth/register", {
    name: `Conta ${provider}`,
    email,
    password: randomBytes(18).toString("base64url"),
    role: toApiRole(body?.role ?? "fan"),
    acceptTerms: body?.acceptTerms === true,
    acceptCreatorTerms: body?.acceptCreatorTerms === true,
  }, request);
  if (!response.ok || !data.user || !data.accessToken || !data.refreshToken) {
    return NextResponse.json(
      {
        code: data.code ?? (response.status === 409 ? "EMAIL_ALREADY_REGISTERED" : response.status === 429 ? "TOO_MANY_ATTEMPTS" : "REQUEST_FAILED"),
        message: (typeof data.message === "string" && data.message) || authErrorMessage(response.status, "Could not sign in."),
      },
      { status: response.status || 500 },
    );
  }
  const next = NextResponse.json({ user: toSessionUser(data.user) });
  applyAuthCookies(next, { accessToken: data.accessToken, refreshToken: data.refreshToken });
  return next;
}
