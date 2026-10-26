import { NextResponse } from "next/server";
import { proxyApi } from "@/lib/admin-proxy";
import { apiBase } from "@/lib/api-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const response = await fetch(`${apiBase()}/creators/${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  return NextResponse.json(data ?? { message: "Creator not found" }, { status: response.status || 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/creators/${encodeURIComponent(id)}/profile`, { method: "PATCH", body });
}
