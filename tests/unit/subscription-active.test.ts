import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { afterAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { syncChargeFromExpay, type ExpayClient } from "../../packages/core/src/expay";
import { createPrismaPaymentStore } from "../../apps/api/src/modules/payments/expay-store";
import { handleStripeEvent, startSubscriptionCheckout } from "../../apps/api/src/modules/payments/billing";
import { chargeDraftForUser, ensureQuotedPurchase, quoteCharge } from "../../apps/api/src/modules/payments/quote-charge";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

describe("a paid subscription stays active", () => {
  const ids = {
    fanId: "",
    pollFanId: "",
    creatorUserId: "",
    creatorId: "",
    planId: "",
    subscriptionId: "",
    pollSubscriptionId: "",
    purchaseIds: [] as string[],
    chargeId: `chg-active-${suffix}`,
  };

  afterAll(async () => {
    if (ids.purchaseIds.length) {
      await database.ledgerEntry.deleteMany({ where: { purchaseId: { in: ids.purchaseIds } } });
      await database.paymentEvent.deleteMany({
        where: { OR: [{ purchaseId: { in: ids.purchaseIds } }, { providerId: { contains: suffix } }] },
      });
      await database.purchase.deleteMany({ where: { id: { in: ids.purchaseIds } } });
    }
    await database.paymentRecord.deleteMany({ where: { providerChargeId: { contains: suffix } } });
    const subscriptionIds = [ids.subscriptionId, ids.pollSubscriptionId].filter(Boolean);
    if (subscriptionIds.length) await database.subscription.deleteMany({ where: { id: { in: subscriptionIds } } });
    if (ids.creatorId) {
      await database.plan.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.creator.deleteMany({ where: { id: ids.creatorId } });
    }
    const userIds = [ids.fanId, ids.pollFanId, ids.creatorUserId].filter(Boolean);
    if (userIds.length) {
      await database.profile.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await database.$disconnect();
  });

  it("keeps ACTIVE through extend, checkout, and Stripe, and enqueues chat when a charge poll activates", async () => {
    const fan = await database.user.create({
      data: {
        email: `active-fan-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Fan pago", username: `activefan${suffix}` } },
      },
    });
    const pollFan = await database.user.create({
      data: {
        email: `poll-fan-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Fan poll", username: `pollfan${suffix}` } },
      },
    });
    const creatorUser = await database.user.create({
      data: {
        email: `active-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Sarah", username: `activecreator${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle" } },
      },
      include: { creator: true },
    });
    const plan = await database.plan.create({
      data: {
        creatorId: creatorUser.creator!.id,
        name: "Mensal",
        description: "Plano",
        priceCents: 1900,
        durationMonths: 1,
        active: true,
      },
    });
    const endsAt = new Date("2026-11-27T01:39:00.000Z");
    const subscription = await database.subscription.create({
      data: {
        fanId: fan.id,
        creatorId: creatorUser.creator!.id,
        planId: plan.id,
        status: "ACTIVE",
        isDemo: false,
        startsAt: new Date("2026-10-27T01:39:00.000Z"),
        endsAt,
        currentPeriodEnd: endsAt,
      },
    });
    const handJob = await database.chatSequenceJob.create({
      data: {
        id: `test_${suffix}`,
        subscriptionId: subscription.id,
        position: 99,
        runAt: new Date("2026-10-27T03:30:00.000Z"),
        status: "pending",
      },
    });
    ids.fanId = fan.id;
    ids.pollFanId = pollFan.id;
    ids.creatorUserId = creatorUser.id;
    ids.creatorId = creatorUser.creator!.id;
    ids.planId = plan.id;
    ids.subscriptionId = subscription.id;

    const quote = await quoteCharge(fan, { creatorId: ids.creatorId, purpose: "subscription", subjectId: plan.id });
    expect(quote.amountCents).toBe(1900);
    const extend = await ensureQuotedPurchase(
      await chargeDraftForUser(fan, {
        creatorId: ids.creatorId,
        purpose: "subscription",
        subjectId: plan.id,
        idempotencyKey: `extend-${suffix}`,
        amountCents: 1,
      }),
    );
    ids.purchaseIds.push(extend.id);
    expect(extend.status).toBe("PENDING");
    expect(extend.subscriptionId).toBe(subscription.id);

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const checkout = await startSubscriptionCheckout(
        { id: fan.id, email: fan.email, stripeCustomerId: null },
        ids.creatorId,
        plan.id,
      );
      expect(checkout).toMatchObject({ simulation: true, alreadyActive: true });
    } finally {
      if (stripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = stripeKey;
    }

    const stripeSubscriptionId = `sub_${suffix}`;
    await database.subscription.update({ where: { id: subscription.id }, data: { stripeSubscriptionId } });
    await handleStripeEvent({
      id: `evt-incomplete-${suffix}`,
      type: "customer.subscription.updated",
      data: { object: { id: stripeSubscriptionId, status: "incomplete", cancel_at_period_end: false } },
    });

    const kept = await database.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(kept.status).toBe("ACTIVE");
    expect(kept.isDemo).toBe(false);
    expect(kept.planId).toBe(plan.id);
    expect(kept.endsAt?.toISOString()).toBe(endsAt.toISOString());
    expect(kept.currentPeriodEnd?.toISOString()).toBe(endsAt.toISOString());
    expect(await database.chatSequenceJob.findUnique({ where: { id: handJob.id } })).toMatchObject({ status: "pending" });

    const pollDraft = await chargeDraftForUser(pollFan, {
      creatorId: ids.creatorId,
      purpose: "subscription",
      subjectId: plan.id,
      idempotencyKey: `poll-${suffix}`,
      amountCents: 1,
    });
    const pollPurchase = await ensureQuotedPurchase(pollDraft);
    ids.purchaseIds.push(pollPurchase.id);
    const pending = await database.subscription.findUniqueOrThrow({
      where: { fanId_creatorId: { fanId: pollFan.id, creatorId: ids.creatorId } },
    });
    ids.pollSubscriptionId = pending.id;
    expect(pending.status).toBe("PENDING");

    const store = createPrismaPaymentStore();
    await store.insertCharge({
      providerChargeId: ids.chargeId,
      buyerId: pollFan.id,
      creatorId: ids.creatorId,
      purpose: "subscription",
      subjectId: plan.id,
      description: pollDraft.description,
      amountCents: pollDraft.amountCents,
      currency: "BRL",
      status: "pending",
      billingMode: "pix_one_off",
      mandateId: null,
      copiaECola: null,
      qrCode: null,
      idempotencyKey: pollDraft.idempotencyKey,
      accessActive: false,
    });
    const paidCharge = {
      id: ids.chargeId,
      status: "paid" as const,
      amountCents: pollDraft.amountCents,
      copiaECola: null,
      qrCode: null,
    };
    const client: ExpayClient = {
      createCharge: async () => paidCharge,
      getCharge: async () => paidCharge,
      refundCharge: async () => undefined,
      createMandate: async () => ({ id: "mandate", status: "active", charge: null }),
      getMandate: async () => ({ id: "mandate", status: "active", charge: null }),
      createMandateCharge: async () => paidCharge,
    };
    const synced = await syncChargeFromExpay(client, store, ids.chargeId);
    expect(synced?.status).toBe("paid");
    expect(synced?.accessActive).toBe(true);
    const activated = await database.subscription.findUniqueOrThrow({ where: { id: pending.id } });
    expect(activated.status).toBe("ACTIVE");
    expect(activated.endsAt && activated.endsAt.getTime()).toBeGreaterThan(Date.now());
    expect(activated.currentPeriodEnd?.toISOString()).toBe(activated.endsAt?.toISOString());
    const jobs = await database.chatSequenceJob.findMany({
      where: { subscriptionId: pending.id },
      orderBy: { position: "asc" },
    });
    expect(jobs.map((job) => job.position)).toEqual([0, 1, 2, 3]);

    await syncChargeFromExpay(client, store, ids.chargeId);
    expect(await database.chatSequenceJob.count({ where: { subscriptionId: pending.id } })).toBe(4);
    expect(await database.subscription.findUnique({ where: { id: subscription.id } })).toMatchObject({ status: "ACTIVE" });
  });
});
