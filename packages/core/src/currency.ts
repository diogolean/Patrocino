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

export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
  return code;
}

/**
 * Brazil pays in BRL. When the edge country header is missing, pt-BR (and a bare pt)
 * also pays in BRL. Every other detected country or language pays in USD.
 */
export function currencyForVisitor(input: {
  country?: string | null;
  locale?: string | null;
  acceptLanguage?: string | null;
}): ChargeCurrency {
  const country = normalizeCountry(input.country);
  if (country === "BR") return "BRL";
  if (country) return "USD";
  const explicit = (input.locale ?? "").trim().toLowerCase();
  if (explicit) return explicit.startsWith("pt") ? "BRL" : "USD";
  const header = (input.acceptLanguage ?? "").split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!header || header.startsWith("pt")) return "BRL";
  return "USD";
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
