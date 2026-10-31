import { proxyApi } from "@/lib/admin-proxy";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/admin/affiliates/${id}/assignments`, { method: "POST", body });
}
