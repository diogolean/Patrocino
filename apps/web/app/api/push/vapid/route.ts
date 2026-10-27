import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";

export async function GET() {
  const response = await fetch(`${apiBase()}/push/vapid`, { cache: "no-store" });
  const data = (await response.json().catch(() => ({ enabled: false, publicKey: null }))) as {
    enabled?: boolean;
    publicKey?: string | null;
  };
  return NextResponse.json(
    { enabled: Boolean(data.enabled && data.publicKey), publicKey: data.publicKey ?? null },
    { status: response.ok ? 200 : response.status },
  );
}
