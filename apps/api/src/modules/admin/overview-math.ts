export type Money = Record<string, number>;

export const DAY_MS = 86_400_000;

/** Start of the current day in America/Sao_Paulo (UTC-3, no DST). */
export function startOfSaoPauloDay(now: Date) {
  const shifted = new Date(now.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) + 3 * 3_600_000);
}

export function addMoney(target: Money, currency: string, cents: number) {
  const key = (currency || "BRL").toUpperCase();
  target[key] = (target[key] ?? 0) + cents;
  return target;
}

export function sumByCurrency(rows: { currency: string; amountCents: number }[]) {
  return rows.reduce<Money>((acc, row) => addMoney(acc, row.currency, row.amountCents), {});
}

const stripeRef = /^(cs|pi|in|ch|sub)_/;

export function providerOf(providerRef: string | null | undefined) {
  if (!providerRef) return "other";
  return stripeRef.test(providerRef) ? "stripe" : "pix";
}

/** Monthly value of one active subscription in its currency. */
export function monthlyCents(plan: { priceCents: number; priceCentsUsd: number; durationMonths: number }, currency: string) {
  const total = currency.toUpperCase() === "USD" ? plan.priceCentsUsd : plan.priceCents;
  return Math.round(total / Math.max(1, plan.durationMonths));
}

export function rate(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}
