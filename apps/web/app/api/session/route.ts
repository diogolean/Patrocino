import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiAuth, apiBase, toSessionUser } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";
import { ACCESS_COOKIE, REFRESH_COOKIE, applyAuthCookies, clearAuthCookies } from "@/lib/session-cookies";

async function userFromAccess(token: string, request: Request) {
  const response = await fetch(`${apiBase()}/auth/me`, {
    headers: { authorization: `Bearer ${token}`, ...upstreamAuthHeaders(request) },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    user?: { id: string; email: string; role: string; emailVerified?: boolean; name?: string; username?: string; avatarUrl?: string | null };
  };
  return data.user ? toSessionUser(data.user) : null;
}

export async function GET(request: Request) {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const current = access ? await userFromAccess(access, request) : null;
  if (current) return NextResponse.json({ user: current });

  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return NextResponse.json({ user: null });

  const { response, data } = await apiAuth("/auth/refresh", { refreshToken: refresh }, request);
  if (!response.ok || !data.user || !data.accessToken || !data.refreshToken) {
    const expired = NextResponse.json({ user: null });
    clearAuthCookies(expired);
    return expired;
  }
  const next = NextResponse.json({ user: toSessionUser(data.user) });
  applyAuthCookies(next, { accessToken: data.accessToken, refreshToken: data.refreshToken });
  return next;
}
