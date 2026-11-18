import { ServerResponse } from "node:http";

const patched = Symbol.for("patrocino.visitorVary");

function currencyResponse(url: string | undefined) {
  if (!url) return true;
  const path = url.split("?")[0] ?? "";
  if (path.startsWith("/_next") || path.startsWith("/media") || path.startsWith("/icons")) return false;
  if (path.endsWith("/opengraph-image") || /\.[a-z0-9]+$/i.test(path)) return false;
  return true;
}

/**
 * Next replaces the document Vary header with only its router headers. Currency
 * HTML and JSON still have to vary on language and cookie, or a shared cache can
 * serve one price to every visitor.
 */
export function ensureVisitorVary() {
  const proto = ServerResponse.prototype as ServerResponse & { [patched]?: boolean; req?: { url?: string } };
  if (proto[patched]) return;
  proto[patched] = true;
  const original = proto.setHeader;
  proto.setHeader = function (this: ServerResponse & { req?: { url?: string } }, name, value) {
    if (String(name).toLowerCase() === "vary" && currencyResponse(this.req?.url)) {
      const text = Array.isArray(value) ? value.map((item) => String(item)).join(", ") : String(value ?? "");
      const lower = text.toLowerCase();
      if (!lower.includes("accept-language") || !lower.includes("cookie")) {
        value = text ? `Accept-Language, Cookie, ${text}` : "Accept-Language, Cookie";
      }
    }
    return original.call(this, name, value);
  };
}
