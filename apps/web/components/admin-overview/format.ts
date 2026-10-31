import type { Money } from "./types";

export function moneyText(money: Money, locale: string, options: { compact?: boolean } = {}) {
  const format = (currency: string, cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency, ...(options.compact && Math.abs(cents) >= 1_000_000 ? { notation: "compact" } : {}) }).format(cents / 100);
  const parts = Object.entries(money)
    .filter(([, cents]) => cents)
    .sort(([a], [b]) => (a === "BRL" ? -1 : b === "BRL" ? 1 : a.localeCompare(b)))
    .map(([currency, cents]) => format(currency, cents));
  return parts.length ? parts.join(" · ") : format("BRL", 0);
}

export function numberText(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

/** Today's date in São Paulo as YYYY-MM-DD, for date inputs. */
export function saoPauloToday() {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}
