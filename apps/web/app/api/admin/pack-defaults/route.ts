import { proxyApi } from "@/lib/admin-proxy";

export async function PATCH(request: Request) {
  const body = await request.text();
  return proxyApi(request, "/admin/pack-defaults", { method: "PATCH", body });
}
