import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";

export async function POST(request: Request) {
  const body = await request.text();
  const response = await fetch(`${apiBase()}/auth/password/set`, {
    method: "POST",
    headers: { "content-type": "application/json", ...upstreamAuthHeaders(request) },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
