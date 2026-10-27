import { messagePreview } from "./preview";

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  icon: string;
  tag: string;
};

export function readVapidConfig(env: Record<string, string | undefined>): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey || !subject) return null;
  if (!subject.startsWith("mailto:") && !subject.startsWith("https:")) return null;
  return { publicKey, privateKey, subject };
}

export function publicVapid(config: VapidConfig | null) {
  if (!config) return { enabled: false as const, publicKey: null };
  return { enabled: true as const, publicKey: config.publicKey };
}

export function isPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function buildMessagePushPayload(input: {
  creatorName: string;
  body: string;
  creatorId: string;
  creatorUsername?: string | null;
  icon?: string | null;
}): PushPayload {
  const icon = input.icon && input.icon.length <= 500 ? input.icon : "/icons/icon-192.png";
  const title = input.creatorName.trim() || "Patrocino";
  const creatorKey = input.creatorUsername?.trim() || input.creatorId;
  return {
    title,
    body: messagePreview(input.body) || "Nova mensagem",
    url: `/chat/${creatorKey}`,
    icon,
    tag: `chat-${input.creatorId}`,
  };
}

export function pushStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

export function pushSubscriptionGone(status: number | undefined) {
  return status === 404 || status === 410;
}

export async function deliverPush(input: {
  subscriptions: PushSubscriptionRecord[];
  payload: PushPayload;
  send: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}) {
  let sent = 0;
  let removed = 0;
  const body = JSON.stringify(input.payload);
  for (const subscription of input.subscriptions) {
    try {
      await input.send(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        body,
      );
      sent += 1;
    } catch (error) {
      const status = pushStatusCode(error);
      if (!pushSubscriptionGone(status)) continue;
      removed += 1;
      try {
        await input.remove(subscription.id);
      } catch (removeError) {
        console.error(removeError);
      }
    }
  }
  return { sent, removed };
}
