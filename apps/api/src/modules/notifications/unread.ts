import { database } from "@mimelux/db/runtime";
import { findCreatorByKey } from "../chat/creator-key";
import { publicVideoText } from "../media/video-public";
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
        offerPost: { select: { id: true, caption: true, creatorId: true } },
        conversation: {
          include: {
            creator: { include: { user: { include: { profile: true } } } },
          },
        },
      },
    }),
  ]);
  const fan = await database.user.findUnique({ where: { id: fanId }, select: { locale: true } });
  const items = [];
  for (const message of messages) {
    const profile = message.conversation.creator?.user.profile;
    const creatorId = message.conversation.creatorId ?? "";
    const creatorUsername = profile?.username ?? null;
    const creatorKey = creatorUsername || creatorId;
    const scrubbed = message.offerPost
      ? await publicVideoText({
          creatorId: message.offerPost.creatorId,
          postId: message.offerPost.id,
          secret: message.offerPost.caption,
          text: message.body,
          locale: fan?.locale,
        })
      : null;
    items.push({
      id: message.id,
      conversationId: message.conversationId,
      creatorId: creatorId || message.conversation.id,
      creatorUsername,
      creatorName: profile?.name?.trim() || profile?.username || "",
      creatorAvatar: profile?.avatarUrl ?? null,
      preview: messagePreview(scrubbed?.text ?? message.body),
      createdAt: message.createdAt.toISOString(),
      url: creatorKey ? `/chat/${creatorKey}` : "/chat",
    });
  }
  return { count, items };
}

export async function listFanInbox(fanId: string) {
  const conversations = await database.conversation.findMany({
    where: { fanId, creatorId: { not: null } },
    include: {
      creator: { include: { user: { include: { profile: true } } } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          body: true,
          createdAt: true,
          offerPost: { select: { id: true, caption: true, creatorId: true } },
        },
      },
    },
  });
  const unread = await database.message.groupBy({
    by: ["conversationId"],
    where: {
      readAt: null,
      senderId: { not: fanId },
      conversation: { fanId },
    },
    _count: { _all: true },
  });
  const unreadByConversation = new Map(unread.map((row) => [row.conversationId, row._count._all]));
  const fan = await database.user.findUnique({ where: { id: fanId }, select: { locale: true } });
  const items = [];
  for (const conversation of conversations) {
    const profile = conversation.creator?.user.profile;
    const latest = conversation.messages[0];
    const creatorId = conversation.creatorId ?? "";
    const username = profile?.username ?? null;
    const scrubbed = latest?.offerPost
      ? await publicVideoText({
          creatorId: latest.offerPost.creatorId,
          postId: latest.offerPost.id,
          secret: latest.offerPost.caption,
          text: latest.body,
          locale: fan?.locale,
        })
      : null;
    items.push({
      id: conversation.id,
      creatorId,
      creatorUsername: username,
      creatorName: profile?.name?.trim() || username || "",
      creatorAvatar: profile?.avatarUrl ?? null,
      preview: latest ? messagePreview(scrubbed?.text ?? latest.body) : "",
      unread: unreadByConversation.get(conversation.id) ?? 0,
      lastAt: (latest?.createdAt ?? conversation.updatedAt).toISOString(),
    });
  }
  return items.sort((left, right) => right.lastAt.localeCompare(left.lastAt));
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
