import { database } from "@mimelux/db/runtime";
import webpush from "web-push";
import {
  buildMessagePushPayload,
  deliverPush,
  readVapidConfig,
  type VapidConfig,
} from "./push";

let configuredKey = "";

export function ensureWebPush(config: VapidConfig) {
  const stamp = `${config.subject}\n${config.publicKey}\n${config.privateKey}`;
  if (configuredKey === stamp) return;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  configuredKey = stamp;
}

export async function notifyFanOfMessage(messageId: string) {
  const config = readVapidConfig(process.env);
  if (!config) return { enabled: false as const, sent: 0, removed: 0 };
  try {
    const message = await database.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            creator: { include: { user: { include: { profile: true } } } },
          },
        },
      },
    });
    const fanId = message?.conversation.fanId;
    if (!message || !fanId || message.senderId === fanId) {
      return { enabled: true as const, sent: 0, removed: 0 };
    }
    const profile = message.conversation.creator?.user.profile;
    const creatorId = message.conversation.creatorId ?? message.conversation.creator?.id;
    if (!creatorId) return { enabled: true as const, sent: 0, removed: 0 };
    const payload = buildMessagePushPayload({
      creatorName: profile?.name?.trim() || profile?.username || "Patrocino",
      body: message.body,
      creatorId,
      creatorUsername: profile?.username,
      icon: profile?.avatarUrl,
    });
    const subscriptions = await database.pushSubscription.findMany({ where: { userId: fanId } });
    if (subscriptions.length === 0) return { enabled: true as const, sent: 0, removed: 0 };
    ensureWebPush(config);
    const result = await deliverPush({
      subscriptions,
      payload,
      send: (subscription, body) => webpush.sendNotification(subscription, body).then(() => undefined),
      remove: async (id) => {
        await database.pushSubscription.delete({ where: { id } });
      },
    });
    return { enabled: true as const, ...result };
  } catch (error) {
    console.error(error);
    return { enabled: true as const, sent: 0, removed: 0 };
  }
}
