import { proxyApi } from "@/lib/admin-proxy";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return proxyApi(request, `/admin/affiliates/${id}`);
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/admin/affiliates/${id}`, { method: "PATCH", body });
}
