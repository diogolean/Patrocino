const MAX_RETURN_PATH = 2048;

/**
 * Accept only a same-origin relative path (pathname, query, and hash).
 * Absolute URLs, protocol-relative URLs, and backslash tricks are rejected
 * so a `next` parameter cannot leave the site.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_RETURN_PATH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || raw.includes("@") || /[\u0000-\u001F\u007F\u2028\u2029]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, "http://return.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://return.invalid") return null;
  if (url.username || url.password) return null;
  if (!url.pathname.startsWith("/") || url.pathname.startsWith("//") || url.pathname.includes("\\")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
