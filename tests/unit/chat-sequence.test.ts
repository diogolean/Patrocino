import { afterAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
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
    await enqueueChatSequence(database, subscription.id, started);
    await enqueueChatSequence(database, subscription.id, started);
    const queued = await database.chatSequenceJob.findMany({ where: { subscriptionId: subscription.id }, orderBy: { position: "asc" } });
    expect(queued).toHaveLength(4);
    expect(queued.map((job) => job.runAt.toISOString())).toEqual([
      started.toISOString(),
      new Date(started.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      new Date(started.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      new Date(started.getTime() + 72 * 60 * 60 * 1000).toISOString(),
    ]);

    await database.subscription.update({ where: { id: subscription.id }, data: { status: "PENDING" } });
    await enqueueChatSequence(database, subscription.id, started);
    expect(await database.chatSequenceJob.count({ where: { subscriptionId: subscription.id } })).toBe(4);
    await database.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE" } });

    await processDueChatSequences(started);
    await processDueChatSequences(started);
    const welcomeMessage = await database.message.findFirst({
      where: { senderId: creatorUser.id, conversation: { fanId: fan.id } },
      include: { offerPost: true },
    });
    expect(welcomeMessage?.body).toContain("Marina");
    expect(welcomeMessage?.body.toLowerCase()).not.toContain("equipe");
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
    const followUp = await processDueChatSequences(new Date(started.getTime() + 2 * 60 * 60 * 1000));
    expect(followUp.sent).toBeGreaterThanOrEqual(1);
    const second = await database.message.findFirst({
      where: { senderId: creatorUser.id, offerPostId: older.id },
    });
    expect(second?.body).toContain("Bastidores antigos");
    expect(second?.body).toContain("2,50");
    expect(second?.body.toLowerCase()).not.toContain("equipe");

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
    const skipped = await processDueChatSequences(new Date(started.getTime() + 24 * 60 * 60 * 1000));
    expect(skipped.skipped).toBeGreaterThanOrEqual(1);
    expect(await database.chatSequenceJob.findFirst({ where: { subscriptionId: subscription.id, position: 2 } })).toMatchObject({
      status: "skipped",
    });

    await database.subscription.update({ where: { id: subscription.id }, data: { status: "CANCELED" } });
    const stopped = await processDueChatSequences(new Date(started.getTime() + 72 * 60 * 60 * 1000));
    expect(stopped.canceled).toBeGreaterThanOrEqual(1);
    expect(await database.message.count({ where: { senderId: creatorUser.id, conversation: { fanId: fan.id } } })).toBe(2);
    expect(await database.chatSequenceJob.findFirst({ where: { subscriptionId: subscription.id, position: 3 } })).toMatchObject({
      status: "canceled",
    });
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
