import { proxyApi } from "@/lib/admin-proxy";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/creators/${encodeURIComponent(id)}/plans/${encodeURIComponent(planId)}`, {
    method: "PATCH",
    body,
  });
}
