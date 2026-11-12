const blocked = new Set(["private", "public", "tmp", "..", ".", ""]);

/** Originals live under public/ or private/. Any private segment, including private/posters and private/previews, stays off this route. Generated art, FREE posters, and ACTIVE blurred teasers stay. */
export function publicMediaAllowed(parts: string[]) {
  return parts.length > 0 && parts.every((part) => !blocked.has(part));
}
