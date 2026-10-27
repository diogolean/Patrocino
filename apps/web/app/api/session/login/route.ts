import { NextResponse } from "next/server";
import { apiAuth, authErrorMessage, toSessionUser } from "@/lib/api-auth";
import { applyAuthCookies } from "@/lib/session-cookies";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const { response, data } = await apiAuth("/auth/login", {
    email: body?.email ?? "",
    password: body?.password ?? "",
  }, request);
  if (!response.ok || !data.user || !data.accessToken || !data.refreshToken) {
    return NextResponse.json(
      {
        code: data.code ?? (response.status === 401 ? "INVALID_CREDENTIALS" : response.status === 429 ? "TOO_MANY_ATTEMPTS" : "REQUEST_FAILED"),
        message: (typeof data.message === "string" && data.message) || authErrorMessage(response.status, "Could not sign in."),
      },
      { status: response.status || 500 },
    );
  }
  const next = NextResponse.json({ user: toSessionUser(data.user) });
  applyAuthCookies(next, { accessToken: data.accessToken, refreshToken: data.refreshToken });
  return next;
}
