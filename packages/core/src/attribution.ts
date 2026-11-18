/** First-party first-touch attribution. No email or other personal data. */

export const ATTRIBUTION_COOKIE = "patrocino_utm";
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SIGNUP_EVENT_COOKIE = "patrocino_signup";
export const ATTRIBUTION_HEADER = "x-patrocino-attribution";
export const FBP_HEADER = "x-patrocino-fbp";
export const USER_AGENT_HEADER = "x-patrocino-user-agent";

const UTM_MAX = 120;
const FBCLID_MAX = 200;
const FBC_MAX = 250;
const FBP_MAX = 200;
const UA_MAX = 400;
const HEADER_MAX = 1500;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type TouchAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  fbc?: string;
};

export type PurchaseTouch = TouchAttribution & {
  fbp?: string;
  clientIp?: string;
  clientUserAgent?: string;
};

export function sanitizeUtm(value: string | null | undefined, max = UTM_MAX): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned || cleaned.includes("@")) return undefined;
  return cleaned.slice(0, max);
}

export function sanitizeFbclid(value: string | null | undefined): string | undefined {
  const cleaned = sanitizeUtm(value, FBCLID_MAX);
  if (!cleaned || !/^[A-Za-z0-9_-]+$/.test(cleaned)) return undefined;
  return cleaned;
}

export function fbcFromFbclid(fbclid: string, now = Date.now()): string | undefined {
  const id = sanitizeFbclid(fbclid);
  if (!id) return undefined;
  const fbc = `fb.1.${now}.${id}`;
  return fbc.length <= FBC_MAX ? fbc : fbc.slice(0, FBC_MAX);
}

export function sanitizeFbc(value: string | null | undefined): string | undefined {
  const cleaned = sanitizeUtm(value, FBC_MAX);
  if (!cleaned || !/^fb\.\d+\.\d+\.[A-Za-z0-9_-]+$/.test(cleaned)) return undefined;
  return cleaned;
}

export function sanitizeFbp(value: string | null | undefined): string | undefined {
  const cleaned = sanitizeUtm(value, FBP_MAX);
  if (!cleaned || !/^fb\.\d+\.\d+\.[A-Za-z0-9._-]+$/.test(cleaned)) return undefined;
  return cleaned;
}

export function sanitizeUserAgent(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, UA_MAX);
}

export function sanitizeClientIp(value: string | null | undefined): string | undefined {
  const cleaned = value?.trim() ?? "";
  if (!cleaned || cleaned === "unknown" || cleaned.length > 64) return undefined;
  if (!/^[0-9a-fA-F:.]+$/.test(cleaned)) return undefined;
  return cleaned;
}

export function attributionFromSearch(params: URLSearchParams, now = Date.now()): TouchAttribution | null {
  const touch: TouchAttribution = {
    source: sanitizeUtm(params.get("utm_source")),
    medium: sanitizeUtm(params.get("utm_medium")),
    campaign: sanitizeUtm(params.get("utm_campaign")),
    content: sanitizeUtm(params.get("utm_content")),
    term: sanitizeUtm(params.get("utm_term")),
    fbc: fbcFromFbclid(params.get("fbclid") ?? "", now),
  };
  return hasTouch(touch) ? compactTouch(touch) : null;
}

export function preserveAttributionSearch(location: string, source: URLSearchParams): string {
  const url = new URL(location, "https://patrocino.local");
  for (const key of UTM_KEYS) {
    const value = sanitizeUtm(source.get(key));
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  const fbclid = sanitizeFbclid(source.get("fbclid"));
  if (fbclid && !url.searchParams.has("fbclid")) url.searchParams.set("fbclid", fbclid);
  return `${url.pathname}${url.search}`;
}

export function serializeAttribution(touch: TouchAttribution): string {
  const payload = {
    s: touch.source ?? "",
    m: touch.medium ?? "",
    c: touch.campaign ?? "",
    n: touch.content ?? "",
    t: touch.term ?? "",
    f: touch.fbc ?? "",
  };
  return encodeBase64Url(JSON.stringify(payload));
}

export function parseAttribution(value: string | null | undefined): TouchAttribution | null {
  if (!value || value.length > HEADER_MAX) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as Partial<Record<"s" | "m" | "c" | "n" | "t" | "f", unknown>>;
    const touch = compactTouch({
      source: sanitizeUtm(typeof parsed.s === "string" ? parsed.s : undefined),
      medium: sanitizeUtm(typeof parsed.m === "string" ? parsed.m : undefined),
      campaign: sanitizeUtm(typeof parsed.c === "string" ? parsed.c : undefined),
      content: sanitizeUtm(typeof parsed.n === "string" ? parsed.n : undefined),
      term: sanitizeUtm(typeof parsed.t === "string" ? parsed.t : undefined),
      fbc: sanitizeFbc(typeof parsed.f === "string" ? parsed.f : undefined),
    });
    return hasTouch(touch) ? touch : null;
  } catch {
    return null;
  }
}

export function readCookieValue(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const prefix = `${name}=`;
  const part = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  if (!part) return undefined;
  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return undefined;
  }
}

export function touchFromCookieHeader(header: string | null | undefined): TouchAttribution | null {
  return parseAttribution(readCookieValue(header, ATTRIBUTION_COOKIE));
}

export function firstTouch(existing: TouchAttribution | null, incoming: TouchAttribution | null): TouchAttribution | null {
  if (existing && hasTouch(existing)) return existing;
  return incoming && hasTouch(incoming) ? incoming : null;
}

export function attributionCookieAssignment(touch: TouchAttribution, secure: boolean) {
  return `${ATTRIBUTION_COOKIE}=${serializeAttribution(touch)}; path=/; max-age=${ATTRIBUTION_MAX_AGE_SECONDS}; samesite=lax${secure ? "; secure" : ""}`;
}

export function landingAttribution(input: {
  location: string;
  search: URLSearchParams;
  cookieHeader?: string | null;
  secure: boolean;
  now?: number;
}) {
  const location = preserveAttributionSearch(input.location, input.search);
  const existing = touchFromCookieHeader(input.cookieHeader);
  const incoming = attributionFromSearch(input.search, input.now);
  const touch = existing ? null : incoming;
  if (!touch) return { location, cookie: null as null };
  return {
    location,
    cookie: {
      name: ATTRIBUTION_COOKIE,
      value: serializeAttribution(touch),
      options: {
        httpOnly: false as const,
        sameSite: "lax" as const,
        path: "/",
        maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
        secure: input.secure,
      },
    },
  };
}

export function attributionHeaderValue(touch: TouchAttribution | null): string | undefined {
  if (!touch || !hasTouch(touch)) return undefined;
  const value = serializeAttribution(touch);
  return value.length <= HEADER_MAX ? value : undefined;
}

export function purchaseTouchFromHeaders(input: {
  attribution?: string | null;
  fbp?: string | null;
  userAgent?: string | null;
  clientIp?: string | null;
}): PurchaseTouch | null {
  const touch = parseAttribution(input.attribution) ?? {};
  const next: PurchaseTouch = {
    ...touch,
    fbp: sanitizeFbp(input.fbp),
    clientIp: sanitizeClientIp(input.clientIp),
    clientUserAgent: sanitizeUserAgent(input.userAgent),
  };
  const compact = compactPurchase(next);
  return hasPurchase(compact) ? compact : null;
}

export function utmColumns(touch: TouchAttribution | null | undefined) {
  if (!touch) return {};
  return {
    ...(touch.source ? { utmSource: touch.source } : {}),
    ...(touch.medium ? { utmMedium: touch.medium } : {}),
    ...(touch.campaign ? { utmCampaign: touch.campaign } : {}),
    ...(touch.content ? { utmContent: touch.content } : {}),
    ...(touch.term ? { utmTerm: touch.term } : {}),
  };
}

export function purchaseColumns(touch: PurchaseTouch | null | undefined) {
  if (!touch) return {};
  return {
    ...utmColumns(touch),
    ...(touch.fbc ? { fbc: touch.fbc } : {}),
    ...(touch.fbp ? { fbp: touch.fbp } : {}),
    ...(touch.clientIp ? { clientIp: touch.clientIp } : {}),
    ...(touch.clientUserAgent ? { clientUserAgent: touch.clientUserAgent } : {}),
  };
}

export function readMetaPixelId(raw: string | null | undefined): string {
  const value = raw?.trim() ?? "";
  return /^\d{5,20}$/.test(value) ? value : "";
}

export function browserMetaCommand(
  name: "PageView" | "ViewContent" | "CompleteRegistration" | "InitiateCheckout" | "Purchase" | "Subscribe",
  params: Record<string, unknown>,
  eventId?: string,
) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "email" || key === "em" || key === "phone" || key === "external_id") continue;
    if (typeof value === "string" && value.includes("@")) continue;
    if (value !== undefined) safe[key] = value;
  }
  return eventId ? (["track", name, safe, { eventID: eventId }] as const) : (["track", name, safe] as const);
}

function hasTouch(touch: TouchAttribution) {
  return Boolean(touch.source || touch.medium || touch.campaign || touch.content || touch.term || touch.fbc);
}

function hasPurchase(touch: PurchaseTouch) {
  return hasTouch(touch) || Boolean(touch.fbp || touch.clientIp || touch.clientUserAgent);
}

function compactTouch(touch: TouchAttribution): TouchAttribution {
  return {
    ...(touch.source ? { source: touch.source } : {}),
    ...(touch.medium ? { medium: touch.medium } : {}),
    ...(touch.campaign ? { campaign: touch.campaign } : {}),
    ...(touch.content ? { content: touch.content } : {}),
    ...(touch.term ? { term: touch.term } : {}),
    ...(touch.fbc ? { fbc: touch.fbc } : {}),
  };
}

function compactPurchase(touch: PurchaseTouch): PurchaseTouch {
  return {
    ...compactTouch(touch),
    ...(touch.fbp ? { fbp: touch.fbp } : {}),
    ...(touch.clientIp ? { clientIp: touch.clientIp } : {}),
    ...(touch.clientUserAgent ? { clientUserAgent: touch.clientUserAgent } : {}),
  };
}

function encodeBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
