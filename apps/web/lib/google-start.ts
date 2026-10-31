import { readAffiliateCookieHeader } from "@mimelux/core/currency";
import { safeReturnPath } from "./auth-return";

/** Public Google start URL. Never the internal API host. */
export function googleAuthorizeUrl(request: Request) {
  const current = new URL(request.url);
  const configured = process.env.WEB_ORIGIN?.trim().replace(/\/$/, "");
  const origin = configured || current.origin;
  const target = new URL("/v1/auth/google/start", origin);
  const next = safeReturnPath(current.searchParams.get("next"));
  const role = current.searchParams.get("role");
  const accountRole = role === "creator" ? "CREATOR" : role === "affiliate" ? "AFFILIATE" : "FAN";
  const click = readAffiliateCookieHeader(request.headers.get("cookie"));
  if (next) target.searchParams.set("next", next);
  target.searchParams.set("role", accountRole);
  if (click?.clickId) target.searchParams.set("clickId", click.clickId);
  return target;
}
