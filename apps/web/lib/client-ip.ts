import { readAffiliateCookieHeader } from "@mimelux/core/currency";

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

export function visitorForwardHeaders(source?: { get(name: string): string | null }): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!source) return headers;
  const country = source.get("cf-ipcountry");
  if (country) headers["cf-ipcountry"] = country;
  const accept = source.get("accept-language");
  if (accept) headers["accept-language"] = accept;
  const cookie = source.get("cookie") ?? "";
  const locale = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("mimelux-locale="))
    ?.slice("mimelux-locale=".length);
  if (locale) headers["x-patrocino-locale"] = decodeURIComponent(locale);
  const click = readAffiliateCookieHeader(cookie);
  if (click?.clickId) headers["x-patrocino-click"] = click.clickId;
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
