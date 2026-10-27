import { Prisma, database } from "@mimelux/db/runtime";
import {
  chatSequenceJobPlan,
  chatSequenceNeedsVideo,
  defaultChatSequenceSteps,
  recurringIntervalMinutes,
  renderChatSequence,
  type ChatSequenceOfferMode,
} from "@mimelux/core/chat-sequence";
import { findCreatorByKey } from "./creator-key";
import { notifyFanOfMessage } from "../notifications/fan-notify";

type Db = {
  chatSequence: Prisma.TransactionClient["chatSequence"];
  chatSequenceJob: Prisma.TransactionClient["chatSequenceJob"];
  subscription: Prisma.TransactionClient["subscription"];
  conversation: Prisma.TransactionClient["conversation"];
  message: Prisma.TransactionClient["message"];
  post: Prisma.TransactionClient["post"];
  purchase: Prisma.TransactionClient["purchase"];
  creator: Prisma.TransactionClient["creator"];
};

type Offer = { postId: string; title: string; priceCents: number };

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function sequenceRuns(
  subscription: { status: string; currentPeriodEnd: Date | null; endsAt: Date | null },
  now: Date,
) {
  if (subscription.status !== "ACTIVE") return false;
  const end = subscription.currentPeriodEnd ?? subscription.endsAt;
  if (!end) return true;
  return end.getTime() > now.getTime();
}

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export async function ensureChatSequence(db: Db, creatorId: string) {
  const existing = await db.chatSequence.findUnique({
    where: { creatorId },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (existing) return existing;
  try {
    return await db.chatSequence.create({
      data: {
        creatorId,
        enabled: true,
        steps: {
          create: defaultChatSequenceSteps.map((step) => ({
            position: step.position,
            delayMinutes: step.delayMinutes,
            bodyTemplate: step.bodyTemplate,
            offerMode: step.offerMode,
            recurring: step.recurring === true,
          })),
        },
      },
      include: { steps: { orderBy: { position: "asc" } } },
    });
  } catch (error) {
    if (!isUnique(error)) throw error;
    const raced = await db.chatSequence.findUnique({
      where: { creatorId },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    if (!raced) throw error;
    return raced;
  }
}

export async function enqueueChatSequence(db: Db, subscriptionId: string, now = new Date()) {
  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, creatorId: true, status: true },
  });
  if (!subscription || subscription.status !== "ACTIVE") return;
  const sequence = await ensureChatSequence(db, subscription.creatorId);
  if (!sequence.enabled) return;
  for (const step of chatSequenceJobPlan(sequence.steps, now)) {
    try {
      await db.chatSequenceJob.create({
        data: {
          subscriptionId: subscription.id,
          position: step.position,
          runAt: step.runAt,
          status: "pending",
        },
      });
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
}

export async function cancelPendingChatSequence(db: Db, subscriptionId: string) {
  await db.chatSequenceJob.updateMany({
    where: { subscriptionId, status: "pending" },
    data: { status: "canceled" },
  });
}

async function purchasedPostIds(db: Db, buyerId: string, postIds: string[]) {
  if (postIds.length === 0) return new Set<string>();
  const rows = await db.purchase.findMany({
    where: { buyerId, status: "PAID", postId: { in: postIds } },
    select: { postId: true },
  });
  return new Set(rows.map((row) => row.postId).filter((id): id is string => Boolean(id)));
}

async function resolveOffer(
  db: Db,
  input: {
    creatorId: string;
    buyerId: string;
    offerMode: string;
    postId: string | null;
    now: Date;
  },
): Promise<Offer | null> {
  if (input.offerMode === "none") return null;
  if (input.offerMode === "post") {
    if (!input.postId) return null;
    const post = await db.post.findFirst({
      where: {
        id: input.postId,
        creatorId: input.creatorId,
        deletedAt: null,
        publishedAt: { not: null, lte: input.now },
        priceCents: { gt: 0 },
        media: { some: { kind: "VIDEO" } },
      },
      select: { id: true, caption: true, priceCents: true },
    });
    if (!post?.priceCents) return null;
    const bought = await purchasedPostIds(db, input.buyerId, [post.id]);
    if (bought.has(post.id)) return null;
    return { postId: post.id, title: post.caption, priceCents: post.priceCents };
  }
  const posts = await db.post.findMany({
    where: {
      creatorId: input.creatorId,
      deletedAt: null,
      publishedAt: { not: null, lte: input.now },
      visibility: { in: ["PPV", "SUBSCRIBER_PPV"] },
      priceCents: { gt: 0 },
      media: { some: { kind: "VIDEO" } },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 30,
    select: { id: true, caption: true, priceCents: true },
  });
  const bought = await purchasedPostIds(db, input.buyerId, posts.map((post) => post.id));
  const next = posts.find((post) => post.priceCents && !bought.has(post.id));
  if (!next?.priceCents) return null;
  return { postId: next.id, title: next.caption, priceCents: next.priceCents };
}

async function deliverJob(
  db: Db,
  jobId: string,
  now: Date,
): Promise<{ status: "sent" | "skipped" | "canceled"; messageId?: string }> {
  const job = await db.chatSequenceJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "pending") return { status: "canceled" };
  const subscription = await db.subscription.findUnique({
    where: { id: job.subscriptionId },
    include: {
      fan: { include: { profile: true } },
      creator: { include: { user: { include: { profile: true } }, chatSequence: { include: { steps: true } } } },
    },
  });
  if (!subscription || !sequenceRuns(subscription, now)) {
    await cancelPendingChatSequence(db, job.subscriptionId);
    return { status: "canceled" };
  }
  const sequence = subscription.creator.chatSequence;
  const ordered = [...(sequence?.steps ?? [])].sort((left, right) => left.position - right.position);
  const cursor = ordered.find((item) => item.position === job.position);
  const pool = ordered.filter((item) => item.recurring);
  const step = cursor?.recurring ? pool[job.cycle % pool.length] : cursor;
  if (!sequence?.enabled || !step) {
    await db.chatSequenceJob.update({ where: { id: job.id }, data: { status: "canceled" } });
    return { status: "canceled" };
  }
  const recurring = cursor?.recurring === true;
  const offer = await resolveOffer(db, {
    creatorId: subscription.creatorId,
    buyerId: subscription.fanId,
    offerMode: step.offerMode,
    postId: step.postId,
    now,
  });
  if (!offer && chatSequenceNeedsVideo(step.bodyTemplate)) {
    if (recurring) await rescheduleRecurring(db, job.id, job.cycle, sequence.steps, now);
    else await db.chatSequenceJob.update({ where: { id: job.id }, data: { status: "skipped" } });
    return { status: "skipped" };
  }
  const fanName = subscription.fan.profile?.name?.trim() || "você";
  const creatorName = subscription.creator.user.profile?.name?.trim() || "eu";
  const username = subscription.creator.user.profile?.username?.trim();
  const videosUrl = username ? `/creator/${encodeURIComponent(username)}?tab=videos` : "";
  const requestUrl = username ? `/creator/${encodeURIComponent(username)}?pedido=especial` : "";
  const body = renderChatSequence(step.bodyTemplate, {
    fanName,
    creatorName,
    videoTitle: offer?.title ?? "",
    price: offer ? brl(offer.priceCents) : "",
    videosUrl,
    requestUrl,
  }).trim();
  if (!body) {
    if (recurring) await rescheduleRecurring(db, job.id, job.cycle, sequence.steps, now);
    else await db.chatSequenceJob.update({ where: { id: job.id }, data: { status: "skipped" } });
    return { status: "skipped" };
  }
  let conversation = await db.conversation.findUnique({
    where: { fanId_creatorId: { fanId: subscription.fanId, creatorId: subscription.creatorId } },
  });
  if (!conversation) {
    try {
      conversation = await db.conversation.create({
        data: {
          fanId: subscription.fanId,
          creatorId: subscription.creatorId,
          participantIds: [subscription.fanId, subscription.creator.userId],
        },
      });
    } catch (error) {
      if (!isUnique(error)) throw error;
      conversation = await db.conversation.findUnique({
        where: { fanId_creatorId: { fanId: subscription.fanId, creatorId: subscription.creatorId } },
      });
      if (!conversation) throw error;
    }
  }
  const message = await db.message.create({
    data: {
      conversationId: conversation.id,
      senderId: subscription.creator.userId,
      body,
      ppvPriceCents: offer?.priceCents ?? null,
      offerPostId: offer?.postId ?? null,
    },
  });
  if (recurring) {
    await rescheduleRecurring(db, job.id, job.cycle, sequence.steps, now, message.id);
  } else {
    await db.chatSequenceJob.update({
      where: { id: job.id },
      data: { status: "sent", messageId: message.id },
    });
  }
  return { status: "sent", messageId: message.id };
}

async function rescheduleRecurring(
  db: Db,
  jobId: string,
  cycle: number,
  steps: { delayMinutes: number; recurring: boolean; position: number }[],
  now: Date,
  messageId?: string,
) {
  const interval = recurringIntervalMinutes(steps);
  await db.chatSequenceJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      runAt: new Date(now.getTime() + interval * 60_000),
      cycle: cycle + 1,
      ...(messageId ? { messageId } : {}),
    },
  });
}

export async function processDueChatSequences(now = new Date()) {
  const messageIds: string[] = [];
  const counts = await database.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM chat_sequence_jobs
      WHERE status = 'pending' AND "runAt" <= ${now}
      ORDER BY "runAt" ASC, id ASC
      LIMIT 20
      FOR UPDATE SKIP LOCKED
    `;
    const totals = { sent: 0, skipped: 0, canceled: 0 };
    for (const row of rows) {
      const outcome = await deliverJob(tx, row.id, now);
      totals[outcome.status] += 1;
      if (outcome.messageId) messageIds.push(outcome.messageId);
    }
    return totals;
  });
  await Promise.all(
    messageIds.map((messageId) =>
      notifyFanOfMessage(messageId).catch((error: unknown) => {
        console.error(error);
      }),
    ),
  );
  return counts;
}

let workerStarted = false;

export function startChatSequenceWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const tick = () => {
    void processDueChatSequences().catch((error: unknown) => {
      console.error(error);
    });
  };
  tick();
  const timer = setInterval(tick, 15_000);
  timer.unref();
}

export async function readFanThread(fanId: string, creatorKey: string) {
  const creator = await findCreatorByKey(creatorKey);
  if (!creator) return { messages: [] as ThreadMessage[], creator: null };
  const profile = creator.user.profile;
  const identity = {
    id: creator.id,
    username: profile?.username ?? null,
    name: profile?.name?.trim() || profile?.username || "Criador",
    avatarUrl: profile?.avatarUrl ?? null,
  };
  const conversation = await database.conversation.findUnique({
    where: { fanId_creatorId: { fanId, creatorId: creator.id } },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { offerPost: { select: { id: true, caption: true, priceCents: true, deletedAt: true } } },
      },
    },
  });
  if (!conversation) return { messages: [] as ThreadMessage[], creator: identity };
  const postIds = conversation.messages.map((message) => message.offerPostId).filter((id): id is string => Boolean(id));
  const bought = await purchasedPostIds(database, fanId, postIds);
  const messages: ThreadMessage[] = conversation.messages
    .filter((message) => message.senderId === creator.userId)
    .map((message) => {
      const post = message.offerPost;
      const offer =
        post && !post.deletedAt && post.priceCents
          ? {
              postId: post.id,
              title: post.caption,
              priceCents: post.priceCents,
              purchased: bought.has(post.id),
            }
          : null;
      return {
        id: message.id,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        offer,
      };
    });
  return { messages, creator: identity };
}

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  offer: { postId: string; title: string; priceCents: number; purchased: boolean } | null;
};

export type SequenceStepInput = {
  position: number;
  delayMinutes: number;
  bodyTemplate: string;
  offerMode: ChatSequenceOfferMode;
  postId?: string | null;
  recurring?: boolean;
};

export async function replaceChatSequence(creatorId: string, enabled: boolean, steps: SequenceStepInput[]) {
  return database.$transaction(async (tx) => {
    const sequence = await ensureChatSequence(tx, creatorId);
    const positions = steps.map((step) => step.position);
    await tx.chatSequence.update({ where: { id: sequence.id }, data: { enabled } });
    await tx.chatSequenceStep.deleteMany({
      where: { sequenceId: sequence.id, ...(positions.length ? { position: { notIn: positions } } : {}) },
    });
    for (const step of steps) {
      await tx.chatSequenceStep.upsert({
        where: { sequenceId_position: { sequenceId: sequence.id, position: step.position } },
        create: {
          sequenceId: sequence.id,
          position: step.position,
          delayMinutes: step.delayMinutes,
          bodyTemplate: step.bodyTemplate,
          offerMode: step.offerMode,
          postId: step.offerMode === "post" ? step.postId ?? null : null,
          recurring: step.recurring === true,
        },
        update: {
          delayMinutes: step.delayMinutes,
          bodyTemplate: step.bodyTemplate,
          offerMode: step.offerMode,
          postId: step.offerMode === "post" ? step.postId ?? null : null,
          recurring: step.recurring === true,
        },
      });
    }
    if (!enabled) {
      await tx.chatSequenceJob.updateMany({
        where: { status: "pending", subscription: { creatorId } },
        data: { status: "canceled" },
      });
    } else if (positions.length === 0) {
      await tx.chatSequenceJob.updateMany({
        where: { status: "pending", subscription: { creatorId } },
        data: { status: "canceled" },
      });
    } else {
      await tx.chatSequenceJob.updateMany({
        where: { status: "pending", subscription: { creatorId }, position: { notIn: positions } },
        data: { status: "canceled" },
      });
    }
    return tx.chatSequence.findUniqueOrThrow({
      where: { id: sequence.id },
      include: { steps: { orderBy: { position: "asc" } } },
    });
  });
}
