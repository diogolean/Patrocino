import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { planChargeCents } from "../../packages/core/src/monetization";
import { ExpayPaymentsController } from "../../apps/api/src/modules/payments/expay.controller";
import { PaymentsController } from "../../apps/api/src/modules/payments/payments.module";
import { chargeDraftForUser, ensureQuotedPurchase } from "../../apps/api/src/modules/payments/quote-charge";
import { handleStripeEvent } from "../../apps/api/src/modules/payments/billing";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const ids: { fanId: string; otherId: string; creatorUserId: string; creatorId: string; planId: string; purchaseIds: string[] } = {
  fanId: "",
  otherId: "",
  creatorUserId: "",
  creatorId: "",
  planId: "",
  purchaseIds: [],
};

function statusOf(error: unknown) {
  if (error && typeof error === "object" && "getStatus" in error && typeof error.getStatus === "function") {
    return (error as { getStatus: () => number }).getStatus();
  }
  return 0;
}

describe("server priced charges", () => {
  beforeAll(async () => {
    const fan = await database.user.create({
      data: {
        email: `quote-fan-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Apoiador Teste", username: `quotefan${suffix}` } },
      },
    });
    const other = await database.user.create({
      data: {
        email: `quote-other-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
      },
    });
    const creatorUser = await database.user.create({
      data: {
        email: `quote-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Criadora Teste", username: `quotecreator${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle" } },
      },
      include: { creator: true },
    });
    const plan = await database.plan.create({
      data: {
        creatorId: creatorUser.creator!.id,
        name: "Mensal",
        description: "Plano de teste",
        priceCents: 4217,
        durationMonths: 1,
        discountPercent: 0,
        active: true,
      },
    });
    ids.fanId = fan.id;
    ids.otherId = other.id;
    ids.creatorUserId = creatorUser.id;
    ids.creatorId = creatorUser.creator!.id;
    ids.planId = plan.id;
  });

  afterAll(async () => {
    const purchaseIds = ids.purchaseIds;
    if (purchaseIds.length) {
      await database.ledgerEntry.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
      await database.paymentEvent.deleteMany({ where: { OR: [{ purchaseId: { in: purchaseIds } }, { providerId: { contains: suffix } }] } });
      await database.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    }
    if (ids.creatorId) {
      await database.subscription.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.promotion.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.plan.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.creator.deleteMany({ where: { id: ids.creatorId } });
    }
    const userIds = [ids.fanId, ids.otherId, ids.creatorUserId].filter(Boolean);
    if (userIds.length) {
      await database.profile.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await database.$disconnect();
  });

  it("rejects an unauthenticated ExPay charge and an unauthenticated Stripe checkout", async () => {
    await expect(new ExpayPaymentsController().create(undefined, { amountCents: 1, buyerId: ids.otherId })).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 401,
    );
    await expect(
      new PaymentsController().createCheckout(undefined, {
        provider: "stripe",
        purchaseId: "abcdefgh",
        amountCents: 1,
        description: "stolen",
      }),
    ).rejects.toSatisfy((error: unknown) => statusOf(error) === 401);
  });

  it("ignores a tampered amount and a spoofed buyer and charges the database plan price", async () => {
    const fan = await database.user.findUniqueOrThrow({ where: { id: ids.fanId } });
    const plan = await database.plan.findUniqueOrThrow({ where: { id: ids.planId } });
    const draft = await chargeDraftForUser(fan, {
      buyerId: ids.otherId,
      creatorId: ids.creatorId,
      purpose: "subscription",
      subjectId: plan.id,
      amountCents: 1,
      description: "stolen",
      idempotencyKey: `quote-${suffix}`,
      customer: { name: "Impostor", document: "12345678909" },
    });

    expect(draft.buyerId).toBe(fan.id);
    expect(draft.buyerId).not.toBe(ids.otherId);
    expect(draft.amountCents).toBe(planChargeCents(plan));
    expect(draft.amountCents).toBe(4217);
    expect(draft.description).toBe("Criadora Teste · Mensal");
    expect(draft.customer.email).toBe(fan.email);

    const purchase = await ensureQuotedPurchase(draft);
    ids.purchaseIds.push(purchase.id);
    expect(purchase.buyerId).toBe(fan.id);
    expect(purchase.amountCents).toBe(4217);

    await handleStripeEvent({
      id: `evt-short-${suffix}`,
      type: "payment_intent.succeeded",
      data: { object: { id: `pi-${suffix}`, amount: 1, amount_received: 1, metadata: { purchaseId: purchase.id } } },
    });
    expect((await database.purchase.findUnique({ where: { id: purchase.id } }))?.status).toBe("PENDING");

    await handleStripeEvent({
      id: `evt-ok-${suffix}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi-${suffix}`,
          amount: purchase.amountCents,
          amount_received: purchase.amountCents,
          metadata: { purchaseId: purchase.id },
        },
      },
    });
    expect((await database.purchase.findUnique({ where: { id: purchase.id } }))?.status).toBe("PAID");
  });

  it("includes an active promotion in the subscription price", async () => {
    const fan = await database.user.findUniqueOrThrow({ where: { id: ids.fanId } });
    const now = new Date();
    await database.promotion.create({
      data: {
        creatorId: ids.creatorId,
        planId: ids.planId,
        name: "Teste",
        discountPercent: 10,
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 60_000),
        active: true,
      },
    });
    const draft = await chargeDraftForUser(fan, {
      buyerId: ids.otherId,
      amountCents: 1,
      description: "stolen",
      creatorId: ids.creatorId,
      purpose: "subscription",
      subjectId: "monthly",
      idempotencyKey: `quote-promo-${suffix}`,
    });
    expect(draft.subjectId).toBe(ids.planId);
    expect(draft.amountCents).toBe(Math.round(4217 * 0.9));
  });

  it("rejects a subscription that is not in the database", async () => {
    const fan = await database.user.findUniqueOrThrow({ where: { id: ids.fanId } });
    await expect(
      chargeDraftForUser(fan, {
        creatorId: ids.creatorId,
        purpose: "subscription",
        subjectId: `missing-${suffix}`,
        idempotencyKey: `missing-${suffix}`,
        amountCents: 1,
      }),
    ).rejects.toSatisfy((error: unknown) => statusOf(error) === 404);
  });
});
