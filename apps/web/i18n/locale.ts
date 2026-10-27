export const locales = ["pt-BR", "en", "de", "fr", "es"] as const;
export type AppLocale = (typeof locales)[number];

const spanishCountries = new Set([
  "ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY", "PR", "GQ",
]);
const germanCountries = new Set(["DE", "AT", "CH"]);
const frenchCountries = new Set(["FR", "BE"]);

export function writeLocaleCookie(locale: AppLocale) {
  document.cookie = `mimelux-locale=${locale};path=/;max-age=31536000;samesite=lax`;
}

export function resolveLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().split(",")[0]?.split(";")[0]?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.startsWith("pt")) return "pt-BR";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("en")) return "en";
  return locales.find((locale) => locale.toLowerCase() === normalized) ?? null;
}

export function resolveAcceptLanguage(header: string | null | undefined): AppLocale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qualityParam = params.find((param) => param.trim().toLowerCase().startsWith("q="));
      const quality = qualityParam ? Number(qualityParam.split("=")[1]) : 1;
      return { tag: tag?.trim() ?? "", quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((part) => part.tag && part.tag !== "*")
    .sort((left, right) => right.quality - left.quality);
  for (const part of ranked) {
    const locale = resolveLocale(part.tag);
    if (locale) return locale;
  }
  return null;
}

export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
  return code;
}

export function localeFromCountry(country: string | null | undefined): AppLocale | null {
  const code = normalizeCountry(country);
  if (!code) return null;
  if (code === "BR" || code === "PT") return "pt-BR";
  if (spanishCountries.has(code)) return "es";
  if (germanCountries.has(code)) return "de";
  if (frenchCountries.has(code)) return "fr";
  return "en";
}

export function lookupCountry(ip: string | null): string | null {
  void ip;
  return null;
}

export function resolveRequestLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
  cfIpCountry?: string | null;
  xCountry?: string | null;
  ip?: string | null;
  lookupCountry?: (ip: string | null) => string | null;
}): AppLocale {
  const fromCookie = resolveLocale(input.cookie);
  if (fromCookie) return fromCookie;
  const fromLanguage = resolveAcceptLanguage(input.acceptLanguage);
  if (fromLanguage) return fromLanguage;
  const country =
    normalizeCountry(input.cfIpCountry) ??
    normalizeCountry(input.xCountry) ??
    normalizeCountry((input.lookupCountry ?? lookupCountry)(input.ip ?? null));
  return localeFromCountry(country) ?? "pt-BR";
}
