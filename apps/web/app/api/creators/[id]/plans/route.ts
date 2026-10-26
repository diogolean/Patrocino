import { proxyApi } from "@/lib/admin-proxy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyApi(request, `/creators/${encodeURIComponent(id)}/plans`);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/creators/${encodeURIComponent(id)}/plans`, { method: "POST", body });
}
