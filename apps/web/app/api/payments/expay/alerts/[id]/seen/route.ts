import { proxyApi } from "@/lib/admin-proxy";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyApi(request, `/payments/expay/alerts/${encodeURIComponent(id)}/seen`, { method: "POST", body: "{}" });
}
