import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";
import { upstreamAuthHeaders } from "@/lib/client-ip";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

async function accessToken() {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? "";
}

export async function proxyMediaJson(request: Request, path: string, init?: { method?: string; body?: string }) {
  const access = await accessToken();
  if (!access) return NextResponse.json({ message: "Missing access token" }, { status: 401 });
  const response = await fetch(`${apiBase()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${access}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...upstreamAuthHeaders(request),
    },
    body: init?.body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}

export async function proxyMediaChunk(request: Request, path: string, method: "PUT" | "POST" = "PUT") {
  const access = await accessToken();
  if (!access) return NextResponse.json({ message: "Missing access token" }, { status: 401 });
  const body = await request.arrayBuffer();
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/octet-stream",
      ...upstreamAuthHeaders(request),
    },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}

export async function proxyMediaFile(request: Request, mediaId: string) {
  const access = await accessToken();
  const headers = new Headers(upstreamAuthHeaders(request));
  if (access) headers.set("authorization", `Bearer ${access}`);
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  const token = new URL(request.url).searchParams.get("token");
  const target = new URL(`${apiBase()}/media/${encodeURIComponent(mediaId)}/file`);
  if (token) target.searchParams.set("token", token);
  const response = await fetch(target, {
    headers,
    cache: "no-store",
  });
  const outbound = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "content-disposition",
    "accept-ranges",
    "cache-control",
    "x-content-type-options",
  ]) {
    const value = response.headers.get(name);
    if (value) outbound.set(name, value);
  }
  return new NextResponse(response.body, { status: response.status, headers: outbound });
}
