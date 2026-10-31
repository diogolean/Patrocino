import { NextResponse } from "next/server";
import { demoAffiliate } from "@/lib/affiliates";
import { affiliateCookie, publicOrigin, resolveAffiliateRedirect, type RecordedClick } from "@/lib/affiliate-redirect";
import { apiBase } from "@/lib/api-auth";

type Context = { params: Promise<{ code: string; creator: string }> };

async function recordClick(body: { code: string; subId?: string; locale?: string; creator?: string }): Promise<RecordedClick | null> {
  const response = await fetch(`${apiBase()}/affiliate/clicks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as Partial<RecordedClick>;
  if (!data.clickId || !data.code || !data.creatorUsername) return null;
  return {
    clickId: data.clickId,
    code: data.code,
    creatorUsername: data.creatorUsername,
    clickedAt: data.clickedAt,
  };
}

export async function GET(request: Request, context: Context) {
  const { code, creator } = await context.params;
  const url = new URL(request.url);
  const subId = url.searchParams.get("sub") ?? undefined;
  const locale = url.searchParams.get("lang") ?? undefined;
  const result = await resolveAffiliateRedirect({
    code,
    requestedCreator: creator,
    subId,
    locale,
    secure: url.protocol === "https:",
    record: (body) => recordClick({ ...body, creator }),
  });
  if (!result.cookie && code === demoAffiliate.code) {
    result.cookie = affiliateCookie({
      code,
      clickId: `demo_${crypto.randomUUID()}`,
      creatorUsername: creator,
      subId,
      secure: url.protocol === "https:",
    });
  }
  const response = NextResponse.redirect(new URL(result.location, publicOrigin(request)));
  if (result.cookie) response.cookies.set(result.cookie.name, result.cookie.value, result.cookie.options);
  return response;
}
