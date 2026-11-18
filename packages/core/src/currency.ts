export const chargeCurrencies = ["BRL", "USD"] as const;
export type ChargeCurrency = (typeof chargeCurrencies)[number];

export const catalogDefaults = {
  monthlyUsdCents: 800,
  monthlyBrlCents: 3900,
  monthlyUsdMin: 700,
  monthlyUsdMax: 900,
  monthlyBrlMin: 2900,
  monthlyBrlMax: 3900,
  videoUsdCents: 1900,
  videoBrlCents: 4900,
  guestVideoUsdCents: 2400,
  guestVideoBrlCents: 5900,
  videoUsdMin: 1700,
  videoUsdMax: 2900,
  packUsdCents: 4900,
  packBrlCents: 14900,
  termDiscounts: { 1: 0, 3: 10, 6: 20, 12: 30 } as const,
};

export const sarahMitchellPlanId = "cmviu2opu00wsru2lfry7svky";

export const AFFILIATE_COOKIE = "mimelux_attr";
export const AFFILIATE_WINDOW_DAYS = 30;
export const AFFILIATE_WINDOW_SECONDS = AFFILIATE_WINDOW_DAYS * 24 * 60 * 60;

export const CURRENCY_COOKIE = "mimelux-currency";

export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
  return code;
}

/** Highest-quality language tag in an Accept-Language header. The first tag wins a tie. */
export function primaryLanguageTag(header: string | null | undefined): string {
  if (!header) return "";
  let best = "";
  let bestQuality = -1;
  for (const part of header.split(",")) {
    const [rawTag, ...params] = part.trim().split(";");
    const tag = rawTag?.trim().toLowerCase() ?? "";
    if (!tag || tag === "*") continue;
    const qualityParam = params.find((param) => param.trim().toLowerCase().startsWith("q="));
    const parsed = qualityParam ? Number(qualityParam.split("=")[1]) : 1;
    const quality = Number.isFinite(parsed) ? parsed : 0;
    if (quality > bestQuality) {
      bestQuality = quality;
      best = tag;
    }
  }
  return best;
}

export function currencyChoiceFromCookie(cookieHeader: string | null | undefined): ChargeCurrency | null {
  if (!cookieHeader) return null;
  const part = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${CURRENCY_COOKIE}=`));
  if (!part) return null;
  const raw = part.slice(CURRENCY_COOKIE.length + 1);
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  const choice = value.trim().toUpperCase();
  return choice === "USD" || choice === "BRL" ? choice : null;
}

type HeaderSource = { get(name: string): string | null | undefined } | Record<string, unknown>;

export function readHeader(headers: HeaderSource | null | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const fromGetter = typeof (headers as { get?: unknown }).get === "function"
    ? (headers as { get(name: string): string | null | undefined }).get(name) ??
      (headers as { get(name: string): string | null | undefined }).get(name.toLowerCase())
    : undefined;
  const record = headers as Record<string, unknown>;
  const raw = fromGetter ?? record[name] ?? record[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** cf-ipcountry, then x-vercel-ip-country, then x-patrocino-country. A bare x-country is last. */
export function countryFromHeaders(headers: HeaderSource | null | undefined): string | null {
  return (
    normalizeCountry(readHeader(headers, "cf-ipcountry")) ??
    normalizeCountry(readHeader(headers, "x-vercel-ip-country")) ??
    normalizeCountry(readHeader(headers, "x-patrocino-country")) ??
    normalizeCountry(readHeader(headers, "x-country"))
  );
}

/**
 * Visitor currency, in order:
 * 1. mimelux-currency choice (USD or BRL)
 * 2. country header: BR is BRL, any other country is USD
 * 3. Accept-Language when no country header is present: a primary language
 *    starting with pt is BRL, any other language is USD
 * 4. BRL when none of those signals exist
 */
export function currencyForVisitor(input: {
  country?: string | null;
  acceptLanguage?: string | null;
  /** Explicit USD or BRL chosen by the visitor. Wins over country and language. */
  choice?: string | null;
}): ChargeCurrency {
  const choice = (input.choice ?? "").trim().toUpperCase();
  if (choice === "USD" || choice === "BRL") return choice;
  const country = normalizeCountry(input.country);
  if (country) return country === "BR" ? "BRL" : "USD";
  const language = primaryLanguageTag(input.acceptLanguage);
  if (!language) return "BRL";
  return language.startsWith("pt") ? "BRL" : "USD";
}

export function currencyFromHeaders(headers: HeaderSource | null | undefined): ChargeCurrency {
  const choice = readHeader(headers, "x-patrocino-currency") ?? currencyChoiceFromCookie(readHeader(headers, "cookie"));
  return currencyForVisitor({
    country: countryFromHeaders(headers),
    acceptLanguage: readHeader(headers, "accept-language"),
    choice,
  });
}

export const VISITOR_CACHE_CONTROL = "private, no-store";
export const VISITOR_VARY = "Accept-Language, Cookie";

export function visitorCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": VISITOR_CACHE_CONTROL,
    "CDN-Cache-Control": "no-store",
    Vary: VISITOR_VARY,
  };
}

export function formatMoney(cents: number, currency: ChargeCurrency, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function wholeCurrency(cents: number) {
  return Number.isInteger(cents) && cents > 0 && cents % 100 === 0;
}

export function monthlyPriceAllowed(currency: ChargeCurrency, cents: number) {
  if (!wholeCurrency(cents)) return false;
  if (currency === "USD") return cents >= catalogDefaults.monthlyUsdMin && cents <= catalogDefaults.monthlyUsdMax;
  return cents >= catalogDefaults.monthlyBrlMin && cents <= catalogDefaults.monthlyBrlMax;
}

export function videoPriceAllowed(currency: ChargeCurrency, cents: number) {
  if (!wholeCurrency(cents)) return false;
  if (currency === "USD") return cents >= catalogDefaults.videoUsdMin && cents <= catalogDefaults.videoUsdMax;
  return cents >= 100 && cents <= 100_000;
}

function positiveCents(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

/** Subscriber price stays on the video. An unset guest price keeps that same amount, so untouched test items do not jump. */
export function ppvQuote(input: {
  currency: ChargeCurrency;
  subscribed: boolean;
  subscriberBrl?: number | null;
  subscriberUsd?: number | null;
  guestBrl?: number | null;
  guestUsd?: number | null;
  defaultSubscriberBrl?: number | null;
  defaultSubscriberUsd?: number | null;
  defaultGuestBrl?: number | null;
  defaultGuestUsd?: number | null;
}) {
  const subscriber =
    positiveCents(centsForCurrency(input.currency, input.subscriberBrl, input.subscriberUsd)) ||
    positiveCents(centsForCurrency(input.currency, input.defaultSubscriberBrl, input.defaultSubscriberUsd)) ||
    (input.currency === "USD" ? catalogDefaults.videoUsdCents : catalogDefaults.videoBrlCents);
  const guest =
    positiveCents(centsForCurrency(input.currency, input.guestBrl, input.guestUsd)) ||
    positiveCents(centsForCurrency(input.currency, input.defaultGuestBrl, input.defaultGuestUsd)) ||
    subscriber;
  return {
    amountCents: input.subscribed ? subscriber : guest,
    subscriberCents: subscriber,
    guestCents: guest,
  };
}

export function centsForCurrency(
  currency: ChargeCurrency,
  brlCents: number | null | undefined,
  usdCents: number | null | undefined,
) {
  const amount = currency === "USD" ? usdCents : brlCents;
  return typeof amount === "number" && Number.isInteger(amount) ? amount : 0;
}

/**
 * Charge the visitor currency when that column is a positive stored price.
 * When it is missing or zero, keep the other currency's stored price and say so,
 * instead of billing zero or labeling a real amount with the wrong currency.
 */
export function amountInCurrency(
  currency: ChargeCurrency,
  brlCents: number | null | undefined,
  usdCents: number | null | undefined,
): { amountCents: number; currency: ChargeCurrency } {
  const preferred = centsForCurrency(currency, brlCents, usdCents);
  if (preferred > 0) return { amountCents: preferred, currency };
  const other: ChargeCurrency = currency === "USD" ? "BRL" : "USD";
  const fallback = centsForCurrency(other, brlCents, usdCents);
  if (fallback > 0) return { amountCents: fallback, currency: other };
  return { amountCents: 0, currency };
}

export type AffiliateCookie = {
  code: string;
  slug: string;
  subId: string;
  clickId: string;
  clickedAt: string;
};

export function affiliateCookieValue(input: {
  code: string;
  clickId: string;
  creatorUsername: string;
  subId?: string;
  clickedAt?: string;
}) {
  const payload: AffiliateCookie = {
    code: input.code,
    slug: input.creatorUsername,
    subId: input.subId || "direct",
    clickId: input.clickId,
    clickedAt: input.clickedAt ?? new Date().toISOString(),
  };
  return JSON.stringify(payload);
}

export function parseAffiliateCookie(raw: string | null | undefined): AffiliateCookie | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AffiliateCookie>;
    if (!value || typeof value.clickId !== "string" || typeof value.code !== "string") return null;
    if (!value.clickId || value.clickId.length > 80 || value.code.length > 80) return null;
    return {
      code: value.code,
      slug: typeof value.slug === "string" ? value.slug : "",
      subId: typeof value.subId === "string" ? value.subId : "direct",
      clickId: value.clickId,
      clickedAt: typeof value.clickedAt === "string" ? value.clickedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export type LedgerStatus = "pending" | "confirmed" | "paid" | "reversed";

export function presentCommissionStatus(status: string, holdUntil: Date, now = new Date()): LedgerStatus {
  if (status === "REJECTED") return "reversed";
  if (status === "PAID") return "paid";
  if (status === "APPROVED" || (status === "PENDING" && holdUntil.getTime() <= now.getTime())) return "confirmed";
  return "pending";
}

export type ProgressionPoint = {
  label: string;
  clicks: number;
  conversions: number;
  earningsCents: number;
};

export function progressionSeries(
  input: {
    clicks: Date[];
    conversions: Date[];
    earnings: { at: Date; amountCents: number }[];
  },
  grain: "day" | "month",
  now = new Date(),
  periods = grain === "day" ? 14 : 6,
): ProgressionPoint[] {
  const points: ProgressionPoint[] = [];
  for (let index = periods - 1; index >= 0; index -= 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (grain === "day") start.setUTCDate(start.getUTCDate() - index);
    else start.setUTCMonth(start.getUTCMonth() - index, 1);
    const end = new Date(start.getTime());
    if (grain === "day") end.setUTCDate(end.getUTCDate() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1, 1);
    const inside = (value: Date) => value.getTime() >= start.getTime() && value.getTime() < end.getTime();
    const label = grain === "day"
      ? start.toISOString().slice(0, 10)
      : start.toISOString().slice(0, 7);
    points.push({
      label,
      clicks: input.clicks.filter(inside).length,
      conversions: input.conversions.filter(inside).length,
      earningsCents: input.earnings.filter((row) => inside(row.at) && row.amountCents > 0).reduce((sum, row) => sum + row.amountCents, 0),
    });
  }
  return points;
}

export function conversionRate(clicks: number, conversions: number) {
  if (!clicks || clicks < 0 || conversions < 0) return 0;
  return conversions / clicks;
}

export function readAffiliateCookieHeader(cookieHeader: string | null | undefined): AffiliateCookie | null {
  if (!cookieHeader) return null;
  const part = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${AFFILIATE_COOKIE}=`));
  if (!part) return null;
  const raw = part.slice(AFFILIATE_COOKIE.length + 1);
  try {
    return parseAffiliateCookie(decodeURIComponent(raw));
  } catch {
    return parseAffiliateCookie(raw);
  }
}

/** Opaque tracking code alphabet: lowercase letters and digits without look-alikes (0/o, 1/l/i). */
const LINK_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const LINK_CODE_PATTERN = /^[a-z0-9]{6,12}$/;

/** Random opaque code for an affiliate or an affiliate-creator link. Never derived from a name. */
export function opaqueLinkCode(length = 6, random: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))) {
  const bytes = random(length);
  let code = "";
  for (let index = 0; index < length; index += 1) code += LINK_CODE_ALPHABET[(bytes[index] ?? 0) % LINK_CODE_ALPHABET.length];
  return code;
}

/** Public tracking link: /<creator-username>/<opaque link code>. The affiliate's name never appears. */
export function affiliateLinkPath(username: string, code: string) {
  return `/${encodeURIComponent(username)}/${encodeURIComponent(code)}`;
}
