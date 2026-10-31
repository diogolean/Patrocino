import { NextResponse } from "next/server";
import { LINK_CODE_PATTERN } from "@mimelux/core/currency";
import { publicOrigin, resolveAffiliateRedirect, type RecordedClick } from "@/lib/affiliate-redirect";
import { apiBase } from "@/lib/api-auth";

type Context = { params: Promise<{ creator: string; code: string }> };

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,59}$/i;

async function recordClick(body: { code: string; subId?: string; locale?: string; creator: string }): Promise<RecordedClick | null> {
  const response = await fetch(`${apiBase()}/affiliate/clicks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, exact: true }),
    cache: "no-store",
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as Partial<RecordedClick>;
  if (!data.clickId || !data.code || !data.creatorUsername) return null;
  return { clickId: data.clickId, code: data.code, creatorUsername: data.creatorUsername, clickedAt: data.clickedAt };
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
  let recorded: RecordedClick | null = null;
  try {
    recorded = await recordClick({ code, creator, ...(subId ? { subId } : {}), ...(locale ? { locale } : {}) });
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
  const response = NextResponse.redirect(new URL(result.location, publicOrigin(request)));
  if (result.cookie) response.cookies.set(result.cookie.name, result.cookie.value, result.cookie.options);
  return response;
}
