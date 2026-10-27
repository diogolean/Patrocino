import { proxyApi } from "@/lib/admin-proxy";

export async function POST(request: Request, context: { params: Promise<{ creatorKey: string }> }) {
  const { creatorKey } = await context.params;
  return proxyApi(request, `/conversations/with/${encodeURIComponent(creatorKey)}/read`, { method: "POST", body: "{}" });
}
