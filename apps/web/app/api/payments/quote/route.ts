import { proxyApiOptional } from "@/lib/admin-proxy";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyApiOptional(request, "/payments/quote", { method: "POST", body });
}
