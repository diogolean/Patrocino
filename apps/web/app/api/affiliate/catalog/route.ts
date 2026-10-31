import { proxyApi } from "@/lib/admin-proxy";

export async function GET(request: Request) {
  return proxyApi(request, "/affiliate/catalog");
}
