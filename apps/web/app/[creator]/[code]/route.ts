import { NextResponse } from "next/server";
import { AFFILIATE_EVENT_COOKIE } from "@/lib/analytics";
import { LINK_CODE_PATTERN } from "@mimelux/core/currency";
import { publicOrigin, resolveAffiliateRedirect, type RecordedClick } from "@/lib/affiliate-redirect";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";

type Context = { params: Promise<{ creator: string; code: string }> };

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,59}$/i;

type Recorded = RecordedClick & { packId?: string | null };

/** Forwards the visitor's IP (via the proxy secret) and user agent so the click is the visitor's, not the web server's. */
async function recordClick(request: Request, body: { code: string; subId?: string; locale?: string; creator: string }): Promise<Recorded | null> {
  const userAgent = request.headers.get("user-agent");
  const response = await fetch(`${apiBase()}/affiliate/clicks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...upstreamAuthHeaders(request),
      ...(userAgent ? { "user-agent": userAgent.slice(0, 400) } : {}),
    },
    body: JSON.stringify({ ...body, exact: true }),
    cache: "no-store",
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as Partial<Recorded>;
  if (!data.clickId || !data.code || !data.creatorUsername) return null;
  return { clickId: data.clickId, code: data.code, creatorUsername: data.creatorUsername, clickedAt: data.clickedAt, packId: data.packId ?? null };
}

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/** Tracking link /<creator-username>/<opaque code>. Unknown creator or code is a 404, never a redirect. */
export async function GET(request: Request, context: Context) {
  const { creator, code } = await context.params;
  if (!USERNAME_PATTERN.test(creator) || !LINK_CODE_PATTERN.test(code)) return notFound();
  const url = new URL(request.url);
  const subId = url.searchParams.get("sub") ?? undefined;
  const locale = url.searchParams.get("lang") ?? undefined;
  let recorded: Recorded | null = null;
  try {
    recorded = await recordClick(request, { code, creator, ...(subId ? { subId } : {}), ...(locale ? { locale } : {}) });
  } catch {
    recorded = null;
  }
  if (!recorded || recorded.creatorUsername !== creator) return notFound();
  const result = await resolveAffiliateRedirect({
    code,
    requestedCreator: creator,
    subId,
    locale,
    secure: url.protocol === "https:",
    record: async () => recorded,
  });
  // Pack links open that pack's checkout; the attribution cookie is the same, so the pack sale credits the affiliate.
  const location = recorded.packId
    ? `/checkout?${new URLSearchParams({ kind: "pack", id: recorded.packId, creator, return: `/creator/${creator}`, ref: recorded.code }).toString()}`
    : result.location;
  const response = NextResponse.redirect(new URL(location, publicOrigin(request)));
  if (result.cookie) response.cookies.set(result.cookie.name, result.cookie.value, result.cookie.options);
  // One-shot marker read by the GA client to send affiliate_click (creator + link code only, never the affiliate).
  response.cookies.set(AFFILIATE_EVENT_COOKIE, `${creator}|${recorded.code}|${recorded.packId ? 1 : 0}`, { path: "/", maxAge: 600, sameSite: "lax", secure: url.protocol === "https:", httpOnly: false });
  return response;
}
