import { proxyApi } from "@/lib/admin-proxy";

export async function GET(request: Request) {
  const creatorId = new URL(request.url).searchParams.get("creatorId") ?? "";
  const path = creatorId ? `/admin/catalog-prices?creatorId=${encodeURIComponent(creatorId)}` : "/admin/catalog-prices";
  return proxyApi(request, path);
}

export async function PATCH(request: Request) {
  const body = await request.text();
  return proxyApi(request, "/admin/catalog-prices", { method: "PATCH", body });
}
