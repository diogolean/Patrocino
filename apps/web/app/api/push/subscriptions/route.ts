import { proxyApi } from "@/lib/admin-proxy";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyApi(request, "/push/subscriptions", { method: "POST", body });
}

export async function DELETE(request: Request) {
  const body = await request.text();
  return proxyApi(request, "/push/subscriptions", { method: "DELETE", body });
}
