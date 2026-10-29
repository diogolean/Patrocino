import { NextResponse } from "next/server";
import type { AccountRole } from "@mimelux/core";
import { safeReturnPath } from "@/lib/auth-return";
import { apiAuth, authErrorMessage, toApiRole, toSessionUser } from "@/lib/api-auth";
import { applyAuthCookies } from "@/lib/session-cookies";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    password?: string;
    role?: AccountRole;
    acceptTerms?: boolean;
    acceptCreatorTerms?: boolean;
    locale?: string;
    next?: string;
  } | null;
  const returnPath = safeReturnPath(body?.next);
  const { response, data } = await apiAuth("/auth/register", {
    name: body?.name ?? "",
    email: body?.email ?? "",
    password: body?.password ?? "",
    role: toApiRole(body?.role ?? "fan"),
    acceptTerms: body?.acceptTerms === true,
    acceptCreatorTerms: body?.acceptCreatorTerms === true,
    locale: body?.locale,
    ...(returnPath ? { next: returnPath } : {}),
  }, request);
  if (!response.ok || !data.user || !data.accessToken || !data.refreshToken) {
    return NextResponse.json(
      {
        code: data.code ?? (response.status === 409 ? "EMAIL_ALREADY_REGISTERED" : response.status === 429 ? "TOO_MANY_ATTEMPTS" : "REQUEST_FAILED"),
        message: (typeof data.message === "string" && data.message) || authErrorMessage(response.status, "Could not create the account."),
      },
      { status: response.status || 500 },
    );
  }
  const next = NextResponse.json({ user: toSessionUser(data.user) });
  applyAuthCookies(next, { accessToken: data.accessToken, refreshToken: data.refreshToken });
  return next;
}
