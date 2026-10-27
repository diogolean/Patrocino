import { proxyApi } from "@/lib/admin-proxy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyApi(request, `/payments/expay/charges/${encodeURIComponent(id)}`);
}
