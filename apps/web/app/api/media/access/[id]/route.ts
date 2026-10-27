import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const access = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!access) return NextResponse.json({ message: "Missing access token" }, { status: 401 });
  const response = await fetch(`${apiBase()}/media/${encodeURIComponent(id)}/access`, {
    headers: { authorization: `Bearer ${access}`, ...upstreamAuthHeaders(request) },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as { url?: string; expiresAt?: string; handle?: string | null; message?: string };
  if (response.ok && typeof data.url === "string") {
    const token = new URL(data.url, "http://127.0.0.1").searchParams.get("token");
    data.url = token ? `/api/media/file/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}` : undefined;
  }
  return NextResponse.json(data, { status: response.status });
}
