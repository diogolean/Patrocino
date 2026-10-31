const labels = {
  "pt-BR": (n: number) => `Vídeo exclusivo #${n}`,
  en: (n: number) => `Exclusive video #${n}`,
  es: (n: number) => `Vídeo exclusivo #${n}`,
  de: (n: number) => `Exklusives Video #${n}`,
  fr: (n: number) => `Vidéo exclusive #${n}`,
} as const;

export function exclusiveVideoLabel(index: number, locale?: string | null) {
  const n = Number.isInteger(index) && index > 0 ? index : 1;
  const value = (locale ?? "").trim().toLowerCase();
  if (value.startsWith("pt")) return labels["pt-BR"](n);
  if (value.startsWith("es")) return labels.es(n);
  if (value.startsWith("de")) return labels.de(n);
  if (value.startsWith("fr")) return labels.fr(n);
  if (value.startsWith("en")) return labels.en(n);
  return labels["pt-BR"](n);
}

/** 1-based position of a video in a stable id list. */
export function exclusiveVideoIndex(orderedIds: readonly string[], id: string) {
  const index = orderedIds.indexOf(id);
  return index >= 0 ? index + 1 : 1;
}

const filenameExtension = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|mp4|m4v|mov|webm|mkv|avi|qt)$/i;

/** True when a caption is an upload name rather than a written description. */
export function captionLooksLikeFilename(value: string | null | undefined) {
  const name = (value ?? "").trim();
  if (!name || name.length > 180) return false;
  if (name.includes("/") || name.includes("\\")) return true;
  return filenameExtension.test(name);
}

/** Videos never show a stored title. Photos do only when the caption is not a filename. */
export function hideStoredCaption(caption: string | null | undefined, video: boolean) {
  return video || captionLooksLikeFilename(caption);
}

/** Drops a stored title or filename from text a fan can see. */
export function redactVideoTitle(text: string, secret: string | null | undefined, replacement: string) {
  const needle = secret?.trim();
  if (!needle || !text.includes(needle)) return text;
  return text.split(needle).join(replacement);
}
