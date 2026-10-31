import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AFFILIATE_COOKIE, AFFILIATE_WINDOW_SECONDS, affiliateCookieValue } from "@mimelux/core/currency";
import { demoAffiliate } from "@/lib/affiliates";
import { apiBase } from "@/lib/api-auth";
import { creators } from "@/lib/gateway";

export default async function ReferralCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const slug = creators[0]?.username;
  if (code === demoAffiliate.code && slug) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string") next.set(key, value);
      else if (value?.[0]) next.set(key, value[0]);
    }
    const suffix = next.toString();
    redirect(suffix ? `/r/${code}/${slug}?${suffix}` : `/r/${code}/${slug}`);
  }

  const subId = typeof query.sub === "string" ? query.sub : undefined;
  const locale = typeof query.lang === "string" ? query.lang : undefined;
  let destination = "/topcreators?tab=top-creators";
  try {
    const response = await fetch(`${apiBase()}/affiliate/clicks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, ...(subId ? { subId } : {}), ...(locale ? { locale } : {}) }),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (response.ok) {
      const data = (await response.json()) as { clickId?: string; code?: string; creatorUsername?: string; clickedAt?: string };
      if (data.clickId && data.code && data.creatorUsername) {
        const jar = await cookies();
        jar.set(AFFILIATE_COOKIE, affiliateCookieValue({
          code: data.code,
          clickId: data.clickId,
          creatorUsername: data.creatorUsername,
          subId,
          clickedAt: data.clickedAt,
        }), {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: AFFILIATE_WINDOW_SECONDS,
        });
        destination = `/creator/${data.creatorUsername}`;
      }
    }
  } catch {
    destination = "/topcreators?tab=top-creators";
  }
  redirect(destination);
}
