import { proxyApi } from "@/lib/admin-proxy";

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  return proxyApi(request, `/creators/${encodeURIComponent(username)}/plans`);
}

export async function POST(request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const body = await request.text();
  return proxyApi(request, `/creators/${encodeURIComponent(username)}/plans`, { method: "POST", body });
}
