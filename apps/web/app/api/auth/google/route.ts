import { NextResponse } from "next/server";
import { apiBase } from "@/lib/api-auth";

export async function GET() {
  try {
    const response = await fetch(`${apiBase()}/auth/google`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({ enabled: false }))) as { enabled?: boolean };
    return NextResponse.json({ enabled: data.enabled === true });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}
