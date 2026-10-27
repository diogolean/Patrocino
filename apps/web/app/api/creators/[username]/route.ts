import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  try {
    const response = await fetch(`${apiBase()}/creators/${encodeURIComponent(username)}`, {
      headers: upstreamAuthHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return NextResponse.json(null, { status: response.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null, { status: 503 });
  }
}
