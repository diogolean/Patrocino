const blocked = new Set(["private", "public", "tmp", "..", ".", ""]);

/** Original files live under public/ or private/. Only generated art and blurred previews stay on the public route. */
export function publicMediaAllowed(parts: string[]) {
  return parts.length > 0 && parts.every((part) => !blocked.has(part));
}
