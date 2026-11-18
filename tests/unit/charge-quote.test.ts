import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { planChargeCents } from "../../packages/core/src/monetization";
import { ExpayPaymentsController } from "../../apps/api/src/modules/payments/expay.controller";
import { PaymentsController } from "../../apps/api/src/modules/payments/payments.module";
import { chargeDraftForUser, ensureQuotedPurchase, quoteCharge } from "../../apps/api/src/modules/payments/quote-charge";
import { handleStripeEvent } from "../../apps/api/src/modules/payments/billing";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const ids: { fanId: string; otherId: string; guestFanId: string; creatorUserId: string; creatorId: string; planId: string; purchaseIds: string[] } = {
  fanId: "",
  otherId: "",
  guestFanId: "",
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
    const userIds = [ids.fanId, ids.otherId, ids.guestFanId, ids.creatorUserId].filter(Boolean);
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

  it("quotes a guest video without login and charges that guest price once the fan account exists", async () => {
    const post = await database.post.create({
      data: {
        creatorId: ids.creatorId,
        caption: "clip",
        visibility: "PPV",
        publishedAt: new Date(),
        priceCents: 4900,
        priceCentsUsd: 1900,
        guestPriceCents: 5900,
        guestPriceCentsUsd: 2400,
      },
    });
    const guest = await quoteCharge(null, { creatorId: ids.creatorId, purpose: "post", subjectId: post.id }, "BRL");
    expect(guest.amountCents).toBe(5900);
    expect(guest.subscribed).toBe(false);
    expect(guest.guestCents).toBe(5900);
    const guestUsd = await quoteCharge(null, { creatorId: ids.creatorId, purpose: "post", subjectId: post.id }, "USD");
    expect(guestUsd.amountCents).toBe(2400);

    const view = await new ExpayPaymentsController().quote(
      undefined,
      { headers: { "accept-language": "pt-BR" } } as never,
      { creatorId: ids.creatorId, purpose: "post", subjectId: post.id },
    );
    expect(view.amountCents).toBe(5900);
    expect(view.currency).toBe("BRL");
    expect(view.authenticated).toBe(false);
    const viewUsd = await new ExpayPaymentsController().quote(
      undefined,
      { headers: { "accept-language": "en-US" } } as never,
      { creatorId: ids.creatorId, purpose: "post", subjectId: post.id },
    );
    expect(viewUsd.amountCents).toBe(2400);
    expect(viewUsd.currency).toBe("USD");
    await expect(
      new ExpayPaymentsController().quote(undefined, { headers: {} } as never, {
        creatorId: ids.creatorId,
        purpose: "subscription",
        subjectId: ids.planId,
      }),
    ).rejects.toSatisfy((error: unknown) => statusOf(error) === 401);

    const fan = await database.user.create({
      data: {
        email: `guest-video-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Guest Fan", username: `guestvideo${suffix}` } },
      },
    });
    ids.guestFanId = fan.id;
    const draft = await chargeDraftForUser(
      fan,
      {
        creatorId: ids.creatorId,
        purpose: "post",
        subjectId: post.id,
        idempotencyKey: `guest-video-${suffix}`,
        amountCents: 1,
      },
      "BRL",
    );
    expect(draft.amountCents).toBe(5900);
    expect(draft.buyerId).toBe(fan.id);
    expect(draft.purpose).toBe("post");
    const purchase = await ensureQuotedPurchase(draft);
    ids.purchaseIds.push(purchase.id);
    expect(purchase.kind).toBe("POST");
    expect(purchase.postId).toBe(post.id);
    expect(purchase.amountCents).toBe(5900);
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
