import { proxyApi } from "@/lib/admin-proxy";

export async function GET(request: Request) {
  const creatorId = new URL(request.url).searchParams.get("creatorId") ?? "";
  const path = creatorId ? `/admin/packs?creatorId=${encodeURIComponent(creatorId)}` : "/admin/packs";
  return proxyApi(request, path);
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyApi(request, "/admin/packs", { method: "POST", body });
}
