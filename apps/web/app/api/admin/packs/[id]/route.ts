import { proxyApi } from "@/lib/admin-proxy";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/admin/packs/${id}`, { method: "PATCH", body });
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return proxyApi(request, `/admin/packs/${id}`, { method: "DELETE" });
}
