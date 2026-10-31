import { proxyApi } from "@/lib/admin-proxy";

export async function POST(request: Request) {
  return proxyApi(request, "/affiliate/links", { method: "POST", body: await request.text() });
}
