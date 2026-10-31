import { proxyApi } from "@/lib/admin-proxy";

export async function DELETE(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return proxyApi(request, `/affiliate/links/${encodeURIComponent(code)}`, { method: "DELETE" });
}
