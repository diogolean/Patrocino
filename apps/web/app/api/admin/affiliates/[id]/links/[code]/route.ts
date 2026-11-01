import { proxyApi } from "@/lib/admin-proxy";

type Context = { params: Promise<{ id: string; code: string }> };

export async function DELETE(request: Request, context: Context) {
  const { id, code } = await context.params;
  return proxyApi(request, `/admin/affiliates/${encodeURIComponent(id)}/links/${encodeURIComponent(code)}`, { method: "DELETE" });
}
