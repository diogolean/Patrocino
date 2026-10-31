import { proxyMediaChunk } from "@/lib/media-proxy";

export async function POST(request: Request) {
  return proxyMediaChunk(request, "/auth/avatar", "POST");
}
