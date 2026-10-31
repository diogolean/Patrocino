import { afterAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { chatSequenceJobPlan, defaultChatSequenceSteps } from "../../packages/core/src/chat-sequence";
import { enqueueChatSequence, processDueChatSequences } from "../../apps/api/src/modules/chat/sequence";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

describe("creator chat sequence", () => {
  const ids = {
    fanId: "",
    otherFanId: "",
    creatorUserId: "",
    creatorId: "",
    planId: "",
    subscriptionId: "",
    otherSubscriptionId: "",
    olderId: "",
    newerId: "",
  };

  afterAll(async () => {
    if (ids.creatorId) {
      await database.purchase.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.conversation.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.media.deleteMany({ where: { post: { creatorId: ids.creatorId } } });
      await database.post.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.subscription.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.plan.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.creator.deleteMany({ where: { id: ids.creatorId } });
    }
    const userIds = [ids.fanId, ids.otherFanId, ids.creatorUserId].filter(Boolean);
    if (userIds.length) {
      await database.profile.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await database.$disconnect();
  });

  it("schedules once, sends the welcome, skips a bought video, and stops when the subscription ends", async () => {
    const fan = await database.user.create({
      data: {
        email: `seq-fan-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Marina", username: `seqfan${suffix}` } },
      },
    });
    const creatorUser = await database.user.create({
      data: {
        email: `seq-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Luna", username: `seqcreator${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle" } },
      },
      include: { creator: true },
    });
    const plan = await database.plan.create({
      data: {
        creatorId: creatorUser.creator!.id,
        name: "Mensal",
        description: "Plano",
        priceCents: 1490,
        durationMonths: 1,
      },
    });
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const subscription = await database.subscription.create({
      data: {
        fanId: fan.id,
        creatorId: creatorUser.creator!.id,
        planId: plan.id,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt,
        currentPeriodEnd: endsAt,
      },
    });
    const older = await database.post.create({
      data: {
        creatorId: creatorUser.creator!.id,
        caption: "Bastidores antigos",
        visibility: "SUBSCRIBER_PPV",
        priceCents: 250,
        publishedAt: new Date("2026-10-01T12:00:00.000Z"),
        media: { create: { kind: "VIDEO", storageKey: `uploads/${suffix}/older.mp4`, mimeType: "video/mp4", private: true } },
      },
    });
    const newer = await database.post.create({
      data: {
        creatorId: creatorUser.creator!.id,
        caption: "Bastidores de hoje",
        visibility: "SUBSCRIBER_PPV",
        priceCents: 400,
        publishedAt: new Date("2026-10-20T12:00:00.000Z"),
        media: { create: { kind: "VIDEO", storageKey: `uploads/${suffix}/newer.mp4`, mimeType: "video/mp4", private: true } },
      },
    });
    ids.fanId = fan.id;
    ids.creatorUserId = creatorUser.id;
    ids.creatorId = creatorUser.creator!.id;
    ids.planId = plan.id;
    ids.subscriptionId = subscription.id;
    ids.olderId = older.id;
    ids.newerId = newer.id;

    const started = new Date("2026-10-27T12:00:00.000Z");
    const schedule = chatSequenceJobPlan(defaultChatSequenceSteps, started);
    await enqueueChatSequence(database, subscription.id, started);
    await enqueueChatSequence(database, subscription.id, started);
    const queued = await database.chatSequenceJob.findMany({ where: { subscriptionId: subscription.id }, orderBy: { position: "asc" } });
    expect(queued.map((job) => [job.position, job.runAt.toISOString()])).toEqual(
      schedule.map((job) => [job.position, job.runAt.toISOString()]),
    );

    await database.subscription.update({ where: { id: subscription.id }, data: { status: "PENDING" } });
    await enqueueChatSequence(database, subscription.id, started);
    expect(await database.chatSequenceJob.count({ where: { subscriptionId: subscription.id } })).toBe(schedule.length);
    await database.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE" } });

    await processDueChatSequences(started);
    await processDueChatSequences(started);
    const welcomeMessage = await database.message.findFirst({
      where: { senderId: creatorUser.id, conversation: { fanId: fan.id, creatorId: creatorUser.creator!.id } },
      include: { conversation: true, offerPost: true },
    });
    expect(welcomeMessage?.conversation.creatorId).toBe(creatorUser.creator!.id);
    expect(welcomeMessage?.senderId).toBe(creatorUser.id);
    expect(welcomeMessage?.body).toContain("Marina");
    expect(welcomeMessage?.body).not.toContain("Bastidores");
    expect(welcomeMessage?.body).toContain(`/creator/seqcreator${suffix}?tab=videos`);
    expect(welcomeMessage?.body).toContain("pedido especial");
    expect(welcomeMessage?.body.toLowerCase()).not.toMatch(/equipe|\bbot\b/);
    expect(welcomeMessage?.offerPostId).toBe(newer.id);

    await database.purchase.create({
      data: {
        buyerId: fan.id,
        creatorId: creatorUser.creator!.id,
        postId: newer.id,
        kind: "POST",
        status: "PAID",
        amountCents: 400,
        idempotencyKey: `seq-newer-${suffix}`,
      },
    });
    await processDueChatSequences(new Date(started.getTime() + 2 * 60_000));
    const second = await database.message.findFirst({
      where: { senderId: creatorUser.id, offerPostId: older.id },
      include: { conversation: true },
    });
    expect(second?.conversation.creatorId).toBe(creatorUser.creator!.id);
    expect(second?.body).toContain("pedido especial");

    await database.purchase.create({
      data: {
        buyerId: fan.id,
        creatorId: creatorUser.creator!.id,
        postId: older.id,
        kind: "POST",
        status: "PAID",
        amountCents: 250,
        idempotencyKey: `seq-older-${suffix}`,
      },
    });
    await processDueChatSequences(new Date(started.getTime() + 10 * 60_000));
    expect(await database.chatSequenceJob.findFirst({ where: { subscriptionId: subscription.id, position: 2 } })).toMatchObject({
      status: "sent",
    });

    const recurring = schedule.at(-1);
    if (!recurring) throw new Error("missing recurring step");
    let recurringJob = await database.chatSequenceJob.findFirst({
      where: { subscriptionId: subscription.id, position: recurring.position },
    });
    for (let attempt = 0; attempt < 6 && recurringJob?.cycle !== 1; attempt += 1) {
      await processDueChatSequences(recurring.runAt);
      recurringJob = await database.chatSequenceJob.findFirst({
        where: { subscriptionId: subscription.id, position: recurring.position },
      });
    }
    expect(recurringJob?.status).toBe("pending");
    expect(recurringJob?.cycle).toBe(1);
    expect(recurringJob?.runAt.toISOString()).toBe(new Date(recurring.runAt.getTime() + 21 * 24 * 60 * 60_000).toISOString());
    const beforeStop = await database.message.count({
      where: { senderId: creatorUser.id, conversation: { fanId: fan.id, creatorId: creatorUser.creator!.id } },
    });

    await database.subscription.update({ where: { id: subscription.id }, data: { status: "CANCELED" } });
    const stopAt = recurringJob?.runAt ?? recurring.runAt;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const current = await database.chatSequenceJob.findFirst({
        where: { subscriptionId: subscription.id, position: recurring.position },
      });
      if (current?.status === "canceled") break;
      await processDueChatSequences(stopAt);
    }
    expect(await database.chatSequenceJob.findFirst({ where: { subscriptionId: subscription.id, position: recurring.position } })).toMatchObject({
      status: "canceled",
    });
    expect(
      await database.message.count({
        where: { senderId: creatorUser.id, conversation: { fanId: fan.id, creatorId: creatorUser.creator!.id } },
      }),
    ).toBe(beforeStop);
  });

  it("does not send the same step twice when two workers run together", async () => {
    const fan = await database.user.create({
      data: {
        email: `seq-fan2-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Pedro", username: `seqfan2${suffix}` } },
      },
    });
    ids.otherFanId = fan.id;
    const subscription = await database.subscription.create({
      data: {
        fanId: fan.id,
        creatorId: ids.creatorId,
        planId: ids.planId,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    ids.otherSubscriptionId = subscription.id;
    const now = new Date();
    await enqueueChatSequence(database, subscription.id, now);
    await Promise.all([processDueChatSequences(now), processDueChatSequences(now)]);
    const messages = await database.message.count({
      where: { senderId: ids.creatorUserId, conversation: { fanId: fan.id } },
    });
    expect(messages).toBe(1);
    const welcome = await database.chatSequenceJob.findFirst({ where: { subscriptionId: subscription.id, position: 0 } });
    expect(welcome?.status).toBe("sent");
  });

  it("keeps a Sarah subscription out of Albina's conversation", async () => {
    const fan = await database.user.create({
      data: {
        email: `seq-fan-sarah-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Bayazid", username: `seqfansarah${suffix}` } },
      },
    });
    const albinaUser = await database.user.create({
      data: {
        email: `seq-albina-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Albina Schneider", username: `seqalbina${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle" } },
      },
      include: { creator: true },
    });
    const sarahUser = await database.user.create({
      data: {
        email: `seq-sarah-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Sarah Mitchell", username: `seqsarah${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle" } },
      },
      include: { creator: true },
    });
    const plan = await database.plan.create({
      data: {
        creatorId: sarahUser.creator!.id,
        name: "Mensal",
        description: "Plano",
        priceCents: 1490,
        durationMonths: 1,
      },
    });
    const subscription = await database.subscription.create({
      data: {
        fanId: fan.id,
        creatorId: sarahUser.creator!.id,
        planId: plan.id,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    const albinaConversation = await database.conversation.create({
      data: {
        fanId: fan.id,
        creatorId: albinaUser.creator!.id,
        participantIds: [fan.id, albinaUser.id],
        messages: { create: { senderId: albinaUser.id, body: "Oi, eu sou a Albina." } },
      },
    });
    try {
      const now = new Date("2026-10-27T15:00:00.000Z");
      await enqueueChatSequence(database, subscription.id, now);
      await processDueChatSequences(now);
      const sarahMessages = await database.message.findMany({
        where: { conversation: { fanId: fan.id, creatorId: sarahUser.creator!.id } },
      });
      expect(sarahMessages.length).toBeGreaterThan(0);
      expect(sarahMessages.every((message) => message.senderId === sarahUser.id)).toBe(true);
      expect(sarahMessages.some((message) => message.body.includes("Sarah Mitchell"))).toBe(true);
      const albinaMessages = await database.message.findMany({ where: { conversationId: albinaConversation.id } });
      expect(albinaMessages.map((message) => message.body)).toEqual(["Oi, eu sou a Albina."]);
      expect(await database.message.count({ where: { senderId: albinaUser.id, body: { contains: "aba Vídeos" } } })).toBe(0);
    } finally {
      await database.conversation.deleteMany({ where: { fanId: fan.id } });
      await database.subscription.deleteMany({ where: { fanId: fan.id } });
      await database.plan.deleteMany({ where: { creatorId: sarahUser.creator!.id } });
      await database.creator.deleteMany({ where: { id: { in: [sarahUser.creator!.id, albinaUser.creator!.id] } } });
      await database.profile.deleteMany({ where: { userId: { in: [fan.id, sarahUser.id, albinaUser.id] } } });
      await database.user.deleteMany({ where: { id: { in: [fan.id, sarahUser.id, albinaUser.id] } } });
    }
  });

  it("does not queue steps when the sequence is turned off", async () => {
    await database.chatSequence.update({ where: { creatorId: ids.creatorId }, data: { enabled: false } });
    const fan = await database.user.create({
      data: {
        email: `seq-fan3-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Ana", username: `seqfan3${suffix}` } },
      },
    });
    const subscription = await database.subscription.create({
      data: {
        fanId: fan.id,
        creatorId: ids.creatorId,
        planId: ids.planId,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });
    await enqueueChatSequence(database, subscription.id, new Date());
    expect(await database.chatSequenceJob.count({ where: { subscriptionId: subscription.id } })).toBe(0);
    await database.purchase.deleteMany({ where: { buyerId: fan.id } });
    await database.subscription.delete({ where: { id: subscription.id } });
    await database.profile.deleteMany({ where: { userId: fan.id } });
    await database.user.delete({ where: { id: fan.id } });
    await database.chatSequence.update({ where: { creatorId: ids.creatorId }, data: { enabled: true } });
  });
});
