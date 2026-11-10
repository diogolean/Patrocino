import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";

export async function GET(request: Request) {
  const search = new URL(request.url).search;
  try {
    const response = await fetch(`${apiBase()}/creators${search}`, {
      headers: upstreamAuthHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    const data = await response.json().catch(() => ({ items: [] }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ items: [], nextCursor: null, source: "postgres" }, { status: 503 });
  }
}
