import { normalizeCountry, readAffiliateCookieHeader } from "@mimelux/core/currency";
import {
  ATTRIBUTION_HEADER,
  FBP_HEADER,
  USER_AGENT_HEADER,
  attributionHeaderValue,
  readCookieValue,
  sanitizeFbp,
  sanitizeUserAgent,
  touchFromCookieHeader,
} from "@mimelux/core/attribution";
import { countryFromIp } from "./geoip";

const ipToken = /^[0-9a-fA-F:.]+$/;

export const CLIENT_IP_HEADER = "x-patrocino-client-ip";
export const PROXY_SECRET_HEADER = "x-patrocino-proxy-secret";

function validIp(value: string): string | undefined {
  const token = value.trim().replace(/^\[|\]$/g, "");
  if (!token || token.length > 64 || !ipToken.test(token)) return undefined;
  return token;
}

export function proxyClientIp(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const hops = value.split(",").map((part) => validIp(part)).filter((part): part is string => Boolean(part));
  return hops.at(-1);
}

export function clientIpFrom(headers: { get(name: string): string | null }): string | undefined {
  return proxyClientIp(headers.get("x-forwarded-for"));
}

/** Cloudflare country, then an explicit x-country, then the local GeoIP database. */
export function resolvedVisitorCountry(source?: { get(name: string): string | null } | null): string | null {
  if (!source) return null;
  const fromHeader =
    normalizeCountry(source.get("x-patrocino-country")) ??
    normalizeCountry(source.get("cf-ipcountry")) ??
    normalizeCountry(source.get("x-country"));
  if (fromHeader) return fromHeader;
  return countryFromIp(clientIpFrom(source) ?? null);
}

export function visitorForwardHeaders(source?: { get(name: string): string | null }): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!source) return headers;
  const country = resolvedVisitorCountry(source);
  if (country) {
    headers["cf-ipcountry"] = country;
    headers["x-patrocino-country"] = country;
  }
  const accept = source.get("accept-language");
  if (accept) headers["accept-language"] = accept;
  const cookie = source.get("cookie") ?? "";
  const choice = decodeURIComponent(
    cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("mimelux-currency="))
      ?.slice("mimelux-currency=".length) ?? "",
  ).toUpperCase();
  if (choice === "USD" || choice === "BRL") headers["x-patrocino-currency"] = choice;
  const locale = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("mimelux-locale="))
    ?.slice("mimelux-locale=".length);
  if (locale) headers["x-patrocino-locale"] = decodeURIComponent(locale);
  const click = readAffiliateCookieHeader(cookie);
  if (click?.clickId) headers["x-patrocino-click"] = click.clickId;
  const attribution = attributionHeaderValue(touchFromCookieHeader(cookie));
  if (attribution) headers[ATTRIBUTION_HEADER] = attribution;
  const fbp = sanitizeFbp(readCookieValue(cookie, "_fbp"));
  if (fbp) headers[FBP_HEADER] = fbp;
  const userAgent = sanitizeUserAgent(source.get("user-agent"));
  if (userAgent) headers[USER_AGENT_HEADER] = userAgent;
  return headers;
}

export function upstreamAuthHeaders(request?: { headers: { get(name: string): string | null } }): Record<string, string> {
  const headers: Record<string, string> = { ...visitorForwardHeaders(request?.headers) };
  const ip = request ? clientIpFrom(request.headers) : undefined;
  if (ip) headers[CLIENT_IP_HEADER] = ip;
  const secret = process.env.INTERNAL_PROXY_SECRET;
  if (secret) headers[PROXY_SECRET_HEADER] = secret;
  return headers;
}
