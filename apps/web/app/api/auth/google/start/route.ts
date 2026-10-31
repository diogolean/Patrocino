import { NextResponse } from "next/server";
import { readAffiliateCookieHeader } from "@mimelux/core/currency";
import { safeReturnPath } from "@/lib/auth-return";
import { apiBase } from "@/lib/api-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeReturnPath(url.searchParams.get("next"));
  const role = url.searchParams.get("role");
  const accountRole = role === "creator" ? "CREATOR" : role === "affiliate" ? "AFFILIATE" : "FAN";
  const click = readAffiliateCookieHeader(request.headers.get("cookie"));
  const target = new URL(`${apiBase()}/auth/google/start`);
  if (next) target.searchParams.set("next", next);
  target.searchParams.set("role", accountRole);
  if (click?.clickId) target.searchParams.set("clickId", click.clickId);
  return NextResponse.redirect(target);
}
