import { createHash } from "node:crypto";

export type MetaCapiConfig = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
};

export type CapiPurchaseInput = {
  eventId: string;
  eventTime: number;
  eventSourceUrl: string;
  email: string;
  amountCents: number;
  currency: string;
  kind: string;
  contentId: string;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

export function readMetaCapiConfig(env: NodeJS.ProcessEnv): MetaCapiConfig | null {
  const pixelId = env.META_PIXEL_ID?.trim() ?? "";
  const accessToken = env.META_CAPI_ACCESS_TOKEN?.trim() ?? "";
  if (!/^\d{5,20}$/.test(pixelId) || accessToken.length < 8) return null;
  const testEventCode = env.META_CAPI_TEST_EVENT_CODE?.trim().slice(0, 64) ?? "";
  return { pixelId, accessToken, ...(testEventCode ? { testEventCode } : {}) };
}

/** Meta expects trim + lowercase, then SHA-256 hex. */
export function hashNormalizedEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@") || normalized.length > 320) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

export function moneyValue(cents: number) {
  return Math.round(cents) / 100;
}

export function capiPayload(input: CapiPurchaseInput, testEventCode?: string) {
  const em = hashNormalizedEmail(input.email);
  if (!em || !input.eventId) return null;
  const currency = input.currency === "USD" ? "USD" : "BRL";
  const userData: Record<string, string | string[]> = { em: [em] };
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  const customData = {
    value: moneyValue(input.amountCents),
    currency,
    content_ids: [input.contentId.slice(0, 120)],
    content_type: "product",
  };
  const names = input.kind === "SUBSCRIPTION" ? (["Purchase", "Subscribe"] as const) : (["Purchase"] as const);
  const data = names.map((eventName) => ({
    event_name: eventName,
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.eventSourceUrl,
    user_data: userData,
    custom_data: customData,
  }));
  return testEventCode ? { data, test_event_code: testEventCode } : { data };
}

export function redactSecret(message: string, secret: string) {
  if (!secret) return message;
  return message.split(secret).join("[redacted]");
}

export async function postMetaEvents(
  config: MetaCapiConfig,
  body: unknown,
  fetchImpl: typeof fetch,
  timeoutMs = 4000,
) {
  const url = new URL(`https://graph.facebook.com/v21.0/${config.pixelId}/events`);
  url.searchParams.set("access_token", config.accessToken);
  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return response.ok;
}

/**
 * Sends Purchase (and Subscribe) once. When config is missing this returns
 * before claim, so a later configuration can still send. A failed claim means
 * another caller already took the event.
 */
export async function deliverCapiPurchase(input: {
  config: MetaCapiConfig | null;
  purchase: CapiPurchaseInput;
  claim: () => Promise<boolean>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<"noop" | "skip" | "sent" | "failed"> {
  if (!input.config) return "noop";
  const body = capiPayload(input.purchase, input.config.testEventCode);
  if (!body) return "skip";
  const claimed = await input.claim();
  if (!claimed) return "skip";
  try {
    const ok = await postMetaEvents(input.config, body, input.fetchImpl ?? fetch, input.timeoutMs ?? 4000);
    return ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
