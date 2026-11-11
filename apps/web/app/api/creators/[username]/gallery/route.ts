import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`${apiBase()}/creators/${encodeURIComponent(username)}/gallery`);
  for (const key of ["tab", "offset", "limit", "seed"]) {
    const value = incoming.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  const headers = new Headers({ ...upstreamAuthHeaders(request) });
  const access = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (access) headers.set("authorization", `Bearer ${access}`);
  try {
    const response = await fetch(target, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => null);
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(null, { status: 503 });
  }
}
