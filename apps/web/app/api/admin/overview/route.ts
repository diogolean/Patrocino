import { proxyApi } from "@/lib/admin-proxy";

const allowed = ["range", "from", "to"];

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of allowed) {
    const value = incoming.get(key);
    if (value) query.set(key, value.slice(0, 20));
  }
  return proxyApi(request, `/admin/overview${query.size ? `?${query}` : ""}`);
}
