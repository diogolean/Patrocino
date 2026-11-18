import { NextResponse } from "next/server";
import { visitorCacheHeaders } from "@mimelux/core/currency";
import { proxyApi } from "@/lib/admin-proxy";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  try {
    const response = await fetch(`${apiBase()}/creators/${encodeURIComponent(username)}`, {
      headers: upstreamAuthHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return NextResponse.json(null, { status: response.status, headers: visitorCacheHeaders() });
    return NextResponse.json(data, { headers: visitorCacheHeaders() });
  } catch {
    return NextResponse.json(null, { status: 503, headers: visitorCacheHeaders() });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/creators/${encodeURIComponent(username)}/profile`, { method: "PATCH", body });
}
