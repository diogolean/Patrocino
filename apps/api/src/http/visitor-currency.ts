import { currencyForVisitor, normalizeCountry, type ChargeCurrency } from "@mimelux/core/currency";

export function headerValue(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const raw = headers[name] ?? headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Country from the header the web app sets, then Cloudflare, then x-country. An explicit USD/BRL choice wins. */
export function currencyFromHeaderMap(headers: Record<string, unknown> | undefined): ChargeCurrency {
  const choice = headerValue(headers, "x-patrocino-currency")?.trim().toUpperCase();
  const country =
    normalizeCountry(headerValue(headers, "x-patrocino-country")) ??
    normalizeCountry(headerValue(headers, "cf-ipcountry")) ??
    normalizeCountry(headerValue(headers, "x-country"));
  return currencyForVisitor({
    country,
    locale: headerValue(headers, "x-patrocino-locale"),
    acceptLanguage: headerValue(headers, "accept-language"),
    choice: choice === "USD" || choice === "BRL" ? choice : undefined,
  });
}
