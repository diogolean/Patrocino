import { database } from "@mimelux/db/runtime";
import { findCreatorByKey } from "../chat/creator-key";
import { messagePreview } from "./preview";

const unreadWhere = (fanId: string) => ({
  readAt: null,
  senderId: { not: fanId },
  conversation: { fanId },
});

export async function listUnreadForFan(fanId: string) {
  const where = unreadWhere(fanId);
  const [count, messages] = await Promise.all([
    database.message.count({ where }),
    database.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        conversation: {
          include: {
            creator: { include: { user: { include: { profile: true } } } },
          },
        },
      },
    }),
  ]);
  return {
    count,
    items: messages.map((message) => {
      const profile = message.conversation.creator?.user.profile;
      const creatorId = message.conversation.creatorId ?? message.conversation.id;
      return {
        id: message.id,
        conversationId: message.conversationId,
        creatorId,
        creatorUsername: profile?.username ?? null,
        creatorName: profile?.name?.trim() || profile?.username || "Patrocino",
        creatorAvatar: profile?.avatarUrl ?? null,
        preview: messagePreview(message.body),
        createdAt: message.createdAt.toISOString(),
        url: `/chat/${creatorId}`,
      };
    }),
  };
}

export async function markFanThreadRead(fanId: string, creatorKey: string) {
  const creator = await findCreatorByKey(creatorKey);
  if (!creator) return { read: 0 };
  const result = await database.message.updateMany({
    where: {
      readAt: null,
      senderId: { not: fanId },
      conversation: { fanId, creatorId: creator.id },
    },
    data: { readAt: new Date() },
  });
  return { read: result.count };
}
