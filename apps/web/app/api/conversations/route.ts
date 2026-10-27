import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { proxyApi } from "@/lib/admin-proxy";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

export async function GET(request: Request) {
  const jar = await cookies();
  if (!jar.get(ACCESS_COOKIE)?.value) return NextResponse.json({ items: [] });
  return proxyApi(request, "/conversations");
}
