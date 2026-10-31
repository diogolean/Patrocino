import { AFFILIATE_COOKIE, AFFILIATE_WINDOW_SECONDS, affiliateCookieValue } from "@mimelux/core/currency";

export type RecordedClick = {
  clickId: string;
  code: string;
  creatorUsername: string;
  clickedAt?: string;
};

export function affiliateProfilePath(username: string) {
  return `/creator/${encodeURIComponent(username)}`;
}

/** Path creator wins. Otherwise the creator assigned to the tracking link. */
export function affiliateDestination(input: {
  requestedCreator?: string | null;
  recordedCreator?: string | null;
  fallbackCreator?: string | null;
}) {
  const username = input.requestedCreator?.trim() || input.recordedCreator?.trim() || input.fallbackCreator?.trim() || "";
  if (!username) return "/topcreators?tab=top-creators";
  return affiliateProfilePath(username);
}

export function withReferralQuery(path: string, input: { sub?: string; lang?: string; ref?: string }) {
  const url = new URL(path, "https://patrocino.local");
  if (input.ref) url.searchParams.set("ref", input.ref);
  if (input.sub) url.searchParams.set("sub", input.sub);
  if (input.lang) url.searchParams.set("lang", input.lang);
  return `${url.pathname}${url.search}`;
}

export async function resolveAffiliateRedirect(input: {
  code: string;
  requestedCreator?: string | null;
  subId?: string;
  locale?: string;
  fallbackCreator?: string | null;
  secure: boolean;
  record: (body: { code: string; subId?: string; locale?: string }) => Promise<RecordedClick | null>;
}) {
  let recorded: RecordedClick | null = null;
  try {
    recorded = await input.record({
      code: input.code,
      ...(input.subId ? { subId: input.subId } : {}),
      ...(input.locale ? { locale: input.locale } : {}),
    });
  } catch {
    recorded = null;
  }
  const path = affiliateDestination({
    requestedCreator: input.requestedCreator,
    recordedCreator: recorded?.creatorUsername,
    fallbackCreator: input.fallbackCreator,
  });
  const location = path.startsWith("/creator/")
    ? withReferralQuery(path, { sub: input.subId, lang: input.locale, ref: recorded?.code })
    : path;
  const username = input.requestedCreator?.trim() || recorded?.creatorUsername?.trim() || input.fallbackCreator?.trim() || "";
  const cookie = recorded?.clickId && recorded.code && username
    ? affiliateCookie({
        code: recorded.code,
        clickId: recorded.clickId,
        creatorUsername: username,
        subId: input.subId,
        clickedAt: recorded.clickedAt,
        secure: input.secure,
      })
    : null;
  return { location, cookie };
}

export function affiliateCookie(input: {
  code: string;
  clickId: string;
  creatorUsername: string;
  subId?: string;
  clickedAt?: string;
  secure: boolean;
}) {
  return {
    name: AFFILIATE_COOKIE,
    value: affiliateCookieValue({
      code: input.code,
      clickId: input.clickId,
      creatorUsername: input.creatorUsername,
      subId: input.subId,
      clickedAt: input.clickedAt,
    }),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: AFFILIATE_WINDOW_SECONDS,
      secure: input.secure,
    },
  };
}

/** Public site origin for redirects. Never the internal bind address. */
export function publicOrigin(request: Request) {
  const configured = process.env.WEB_ORIGIN?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const current = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host && !host.startsWith("0.0.0.0")) {
    const proto = request.headers.get("x-forwarded-proto") ?? current.protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return current.origin;
}
