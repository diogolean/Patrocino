const supported = ["pt-BR", "en", "es", "de", "fr"] as const;
export type StoredLocale = (typeof supported)[number];

export function normalizeUserLocale(value: string | null | undefined): StoredLocale | null {
  if (!value) return null;
  const tag = value.trim().toLowerCase().split(",")[0]?.split(";")[0]?.trim() ?? "";
  if (!tag) return null;
  if (tag.startsWith("pt")) return "pt-BR";
  if (tag.startsWith("es")) return "es";
  if (tag.startsWith("de")) return "de";
  if (tag.startsWith("fr")) return "fr";
  if (tag.startsWith("en")) return "en";
  return supported.find((locale) => locale.toLowerCase() === tag) ?? null;
}

export function localeFromAcceptLanguage(header: string | null | undefined): StoredLocale | null {
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
    const locale = normalizeUserLocale(part.tag);
    if (locale) return locale;
  }
  return null;
}
