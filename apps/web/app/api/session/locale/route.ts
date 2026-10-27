import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

export async function POST(request: Request) {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (!access) return NextResponse.json({ saved: false });
  const body = (await request.json().catch(() => null)) as { locale?: string } | null;
  const response = await fetch(`${apiBase()}/auth/locale`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${access}`,
      ...upstreamAuthHeaders(request),
    },
    body: JSON.stringify({ locale: body?.locale ?? "" }),
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ saved: false }, { status: response.status });
  return NextResponse.json({ saved: true });
}
