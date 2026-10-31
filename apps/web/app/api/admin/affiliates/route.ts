import { proxyApi } from "@/lib/admin-proxy";

export async function GET(request: Request) {
  return proxyApi(request, "/admin/affiliates");
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyApi(request, "/admin/affiliates", { method: "POST", body });
}
