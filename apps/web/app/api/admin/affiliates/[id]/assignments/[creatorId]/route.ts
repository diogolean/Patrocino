import { proxyApi } from "@/lib/admin-proxy";

type Context = { params: Promise<{ id: string; creatorId: string }> };

export async function DELETE(request: Request, context: Context) {
  const { id, creatorId } = await context.params;
  return proxyApi(request, `/admin/affiliates/${id}/assignments/${creatorId}`, { method: "DELETE" });
}
