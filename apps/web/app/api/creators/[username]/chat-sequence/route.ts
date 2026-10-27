import { proxyApi } from "@/lib/admin-proxy";

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  return proxyApi(request, `/creators/${encodeURIComponent(username)}/chat-sequence`);
}

export async function PUT(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/creators/${encodeURIComponent(username)}/chat-sequence`, { method: "PUT", body });
}
