import { currencyFromHeaders, visitorCacheHeaders, type ChargeCurrency } from "@mimelux/core/currency";
import type { Request, Response } from "express";

/** Country and currency from the request. An explicit USD/BRL choice wins. */
export function currencyFromHeaderMap(headers: Record<string, unknown> | undefined): ChargeCurrency {
  return currencyFromHeaders(headers);
}

export function applyPrivateCurrencyCache(request: Request) {
  const response = request.res as Response | undefined;
  if (!response || typeof response.setHeader !== "function") return;
  for (const [name, value] of Object.entries(visitorCacheHeaders())) response.setHeader(name, value);
}
