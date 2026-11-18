import { purchaseTouchFromHeaders, type PurchaseTouch } from "@mimelux/core/attribution";
import { resolveClientIp } from "../auth/client-ip";

type HeaderRequest = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

function header(request: HeaderRequest, name: string) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function touchFromRequest(request: HeaderRequest): PurchaseTouch | null {
  const ip = resolveClientIp(request);
  return purchaseTouchFromHeaders({
    attribution: header(request, "x-patrocino-attribution"),
    fbp: header(request, "x-patrocino-fbp"),
    userAgent: header(request, "x-patrocino-user-agent") || header(request, "user-agent"),
    clientIp: ip,
  });
}
