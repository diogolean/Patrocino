import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { proxyApi } from "@/lib/admin-proxy";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

export async function POST(request: Request, context: { params: Promise<{ creatorKey: string }> }) {
  const jar = await cookies();
  if (!jar.get(ACCESS_COOKIE)?.value) return NextResponse.json({ message: "Missing access token" }, { status: 401 });
  const { creatorKey } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/conversations/with/${encodeURIComponent(creatorKey)}/messages`, { method: "POST", body });
}
