import { proxyApi } from "@/lib/admin-proxy";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return proxyApi(request, `/admin/commissions/${id}/paid`, { method: "POST", body: "{}" });
}
