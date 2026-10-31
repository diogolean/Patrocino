"use client";

import { createContext, useContext } from "react";
import { useLocale } from "next-intl";
import { formatMoney, type ChargeCurrency } from "@mimelux/core/currency";

const VisitorCurrencyContext = createContext<ChargeCurrency>("USD");

export function VisitorCurrencyProvider({ currency, children }: { currency: ChargeCurrency; children: React.ReactNode }) {
  return <VisitorCurrencyContext.Provider value={currency}>{children}</VisitorCurrencyContext.Provider>;
}

export function useVisitorCurrency() {
  return useContext(VisitorCurrencyContext);
}

/** Demo and catalog-free prices are stored in BRL; a USD visitor sees the same tier in whole dollars. */
export function demoCents(brlCents: number, currency: ChargeCurrency) {
  if (currency === "BRL" || brlCents <= 0) return brlCents;
  return Math.max(100, Math.round(brlCents / 5 / 100) * 100);
}

/** Formats cents in the visitor currency, or in an explicit currency when the amount already carries one. */
export function useMoney() {
  const visitor = useVisitorCurrency();
  const locale = useLocale();
  return (cents: number, currency: ChargeCurrency = visitor) => formatMoney(cents, currency, locale);
}

/** Formats a BRL-denominated demo amount in the visitor currency. */
export function useDemoMoney() {
  const visitor = useVisitorCurrency();
  const locale = useLocale();
  return (brlCents: number) => formatMoney(demoCents(brlCents, visitor), visitor, locale);
}
