import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const headers = new Headers({ ...upstreamAuthHeaders(request) });
  if (access) headers.set("authorization", `Bearer ${access}`);
  const response = await fetch(`${apiBase()}/creators/${encodeURIComponent(username)}/subscriber-videos`, {
    headers,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({ items: [], subscribed: false }));
  return NextResponse.json(data, { status: response.status });
}
