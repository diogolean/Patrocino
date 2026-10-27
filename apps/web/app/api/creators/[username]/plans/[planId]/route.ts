import { proxyApi } from "@/lib/admin-proxy";

export async function PATCH(request: Request, context: { params: Promise<{ username: string; planId: string }> }) {
  const { username, planId } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/creators/${encodeURIComponent(username)}/plans/${encodeURIComponent(planId)}`, {
    method: "PATCH",
    body,
  });
}
