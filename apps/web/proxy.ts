import { NextResponse, type NextRequest } from "next/server";
import { normalizeCountry, LINK_CODE_PATTERN } from "@mimelux/core/currency";
import { affiliateCookie } from "@/lib/affiliate-redirect";
import { creatorSlugFromPath } from "@/lib/creator-route";
import { isSocialCrawler } from "@/lib/creator-share";

const COOKIE = "gallery_session";
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function proxy(request: NextRequest) {
  const current = request.cookies.get(COOKIE)?.value ?? "";
  const session = SESSION.test(current) ? current : crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-gallery-session", session);
  const country =
    normalizeCountry(request.headers.get("cf-ipcountry")) ??
    normalizeCountry(request.headers.get("x-country"));
  if (country) headers.set("x-patrocino-country", country);
  const response = NextResponse.next({ request: { headers } });
  if (session !== current) {
    response.cookies.set(COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }
  const personalized =
    !request.nextUrl.pathname.endsWith("/opengraph-image") &&
    (/^\/(creator|l|checkout)(\/|$)/.test(request.nextUrl.pathname) || request.nextUrl.pathname.startsWith("/api/creators"));
  if (personalized) {
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("vary", "cf-ipcountry, accept-language, cookie");
  }
  await attachReferral(request, response);
  return response;
}

async function attachReferral(request: NextRequest, response: NextResponse) {
  const ref = request.nextUrl.searchParams.get("ref")?.trim() ?? "";
  const creator = creatorSlugFromPath(request.nextUrl.pathname);
  if (!ref || !creator || !LINK_CODE_PATTERN.test(ref)) return;
  if (isSocialCrawler(request.headers.get("user-agent"))) return;
  const subId = request.nextUrl.searchParams.get("sub") ?? undefined;
  const locale = request.nextUrl.searchParams.get("lang") ?? undefined;
  try {
    const api = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3334/v1").replace(/\/$/, "");
    const country = normalizeCountry(request.headers.get("cf-ipcountry")) ?? normalizeCountry(request.headers.get("x-country"));
    const recorded = await fetch(`${api}/affiliate/clicks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(request.headers.get("user-agent") ? { "user-agent": request.headers.get("user-agent")!.slice(0, 400) } : {}),
        ...(request.headers.get("x-forwarded-for") ? { "x-forwarded-for": request.headers.get("x-forwarded-for")! } : {}),
        ...(country ? { "cf-ipcountry": country, "x-patrocino-country": country } : {}),
      },
      body: JSON.stringify({ code: ref, creator, exact: true, ...(subId ? { subId } : {}), ...(locale ? { locale } : {}) }),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!recorded.ok) return;
    const data = (await recorded.json()) as { clickId?: string; code?: string; creatorUsername?: string; clickedAt?: string };
    if (!data.clickId || !data.code || data.creatorUsername?.toLowerCase() !== creator.toLowerCase()) return;
    const cookie = affiliateCookie({
      code: data.code,
      clickId: data.clickId,
      creatorUsername: data.creatorUsername,
      subId,
      clickedAt: data.clickedAt,
      secure: request.nextUrl.protocol === "https:",
    });
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  } catch {
    return;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|media/).*)"],
};
