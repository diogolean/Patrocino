import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { afterAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { syncChargeFromExpay, type ExpayClient } from "../../packages/core/src/expay";
import { sendResendEmail } from "../../apps/api/src/modules/auth/email-sender";
import { handleStripeEvent } from "../../apps/api/src/modules/payments/billing";
import { notifyBuyerOfPaidCharge, paymentNoticeCopy, buildPaymentPushPayload } from "../../apps/api/src/modules/payments/buyer-notice";
import { createPrismaPaymentStore } from "../../apps/api/src/modules/payments/expay-store";
import {
  EXPAY_PENDING_WINDOW_MS,
  EXPAY_SYNC_INTERVAL_MS,
  listPendingExpayChargeIds,
  reconcilePendingExpayCharges,
} from "../../apps/api/src/modules/payments/expay-sync";
import { listBuyerPaymentAlerts, markPaymentAlertSeen } from "../../apps/api/src/modules/payments/payment-alerts";
import { paymentLogRecord, stripeEventChargeId } from "../../apps/api/src/modules/payments/payment-log";
import { chargeDraftForUser, ensureQuotedPurchase } from "../../apps/api/src/modules/payments/quote-charge";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

describe("payment logs and buyer notice copy", () => {
  it("logs provider, charge id, and a timestamp", () => {
    const record = paymentLogRecord("payment.webhook.arrived", {
      provider: "expay",
      chargeId: "ch_1",
      at: "2026-10-30T12:00:00.000Z",
    });
    expect(record).toMatchObject({
      event: "payment.webhook.arrived",
      provider: "expay",
      chargeId: "ch_1",
      at: "2026-10-30T12:00:00.000Z",
    });
    expect(stripeEventChargeId({ type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } })).toBe("pi_1");
    expect(stripeEventChargeId({ type: "charge.succeeded", data: { object: { id: "ch_1", payment_intent: "pi_2" } } })).toBe("ch_1");
  });

  it("writes the confirmation in the buyer's language", () => {
    expect(paymentNoticeCopy("pt-BR").title).toBe("Pagamento confirmado / acesso liberado");
    expect(paymentNoticeCopy("en").title).toBe("Payment confirmed / access unlocked");
    expect(paymentNoticeCopy("es").title).toBe("Pago confirmado / acceso liberado");
    expect(paymentNoticeCopy("de").title).toBe("Zahlung bestätigt / Zugang frei");
    expect(paymentNoticeCopy("fr").title).toBe("Paiement confirmé / accès ouvert");
    expect(paymentNoticeCopy(null).title).toBe("Pagamento confirmado / acesso liberado");
    expect(buildPaymentPushPayload({ locale: "en", url: "/assinaturas", chargeId: "ch_1" })).toMatchObject({
      title: "Payment confirmed / access unlocked",
      url: "/assinaturas",
      tag: "payment-ch_1",
    });
  });

  it("sends email only when Resend is configured", async () => {
    const calls: { url: string; auth: string; body: { to: string[]; subject: string } }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        auth: String((init?.headers as Record<string, string>).Authorization),
        body: JSON.parse(String(init?.body)) as { to: string[]; subject: string },
      });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await sendResendEmail(
      { apiKey: "re_test", from: "Patrocino <no-reply@patrocino.com>" },
      { to: "fan@example.com", subject: "Pagamento confirmado", html: "<p>ok</p>" },
      fetchImpl,
    );
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(calls[0]?.auth).toBe("Bearer re_test");
    expect(calls[0]?.body.to).toEqual(["fan@example.com"]);
    await expect(
      sendResendEmail(
        { apiKey: "re_test", from: "Patrocino <no-reply@patrocino.com>" },
        { to: "fan@example.com", subject: "x", html: "<p>x</p>" },
        (async () => new Response("no", { status: 422 })) as typeof fetch,
      ),
    ).rejects.toThrow(/422/);
  });
});

describe("pix confirmation releases access without the modal", () => {
  const ids = {
    expayFanId: "",
    stripeFanId: "",
    looseFanId: "",
    creatorUserId: "",
    creatorId: "",
    planId: "",
    chargeId: `chg-pix-${suffix}`,
    oldChargeId: `chg-old-${suffix}`,
    purchaseIds: [] as string[],
  };

  afterAll(async () => {
    if (ids.purchaseIds.length) {
      await database.ledgerEntry.deleteMany({ where: { purchaseId: { in: ids.purchaseIds } } });
      await database.paymentEvent.deleteMany({
        where: { OR: [{ purchaseId: { in: ids.purchaseIds } }, { providerId: { contains: suffix } }] },
      });
      await database.purchase.deleteMany({ where: { id: { in: ids.purchaseIds } } });
    } else {
      await database.paymentEvent.deleteMany({ where: { providerId: { contains: suffix } } });
    }
    await database.paymentRecord.deleteMany({ where: { providerChargeId: { contains: suffix } } });
    const fanIds = [ids.expayFanId, ids.stripeFanId, ids.looseFanId].filter(Boolean);
    if (fanIds.length || ids.creatorId) {
      await database.conversation.deleteMany({
        where: { OR: [...(fanIds.length ? [{ fanId: { in: fanIds } }] : []), ...(ids.creatorId ? [{ creatorId: ids.creatorId }] : [])] },
      });
    }
    if (ids.creatorId) {
      await database.chatSequenceJob.deleteMany({ where: { subscription: { creatorId: ids.creatorId } } });
      await database.subscription.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.plan.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.creator.deleteMany({ where: { id: ids.creatorId } });
    }
    const userIds = [ids.expayFanId, ids.stripeFanId, ids.looseFanId, ids.creatorUserId].filter(Boolean);
    if (userIds.length) {
      await database.profile.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await database.$disconnect();
  });

  it("syncs a pending ExPay charge on a timer, notifies once, and skips charges older than 48 hours", async () => {
    expect(EXPAY_SYNC_INTERVAL_MS).toBe(30_000);
    expect(EXPAY_PENDING_WINDOW_MS).toBe(48 * 60 * 60 * 1000);

    const fan = await database.user.create({
      data: {
        email: `pix-fan-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        locale: "fr",
        profile: { create: { name: "Fan Pix", username: `pixfan${suffix}` } },
      },
    });
    const creatorUser = await database.user.create({
      data: {
        email: `pix-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Criadora Pix", username: `pixcreator${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle" } },
      },
      include: { creator: true },
    });
    const plan = await database.plan.create({
      data: {
        creatorId: creatorUser.creator!.id,
        name: "Mensal",
        description: "Plano",
        priceCents: 2500,
        durationMonths: 1,
        active: true,
      },
    });
    ids.expayFanId = fan.id;
    ids.creatorUserId = creatorUser.id;
    ids.creatorId = creatorUser.creator!.id;
    ids.planId = plan.id;

    const draft = await chargeDraftForUser(fan, {
      creatorId: ids.creatorId,
      purpose: "subscription",
      subjectId: plan.id,
      idempotencyKey: `pix-${suffix}`,
      amountCents: 1,
    });
    const purchase = await ensureQuotedPurchase(draft);
    ids.purchaseIds.push(purchase.id);
    const store = createPrismaPaymentStore();
    const now = new Date("2026-10-30T12:00:00.000Z");
    await store.insertCharge({
      providerChargeId: ids.chargeId,
      buyerId: fan.id,
      creatorId: ids.creatorId,
      purpose: "subscription",
      subjectId: plan.id,
      description: draft.description,
      amountCents: draft.amountCents,
      currency: "BRL",
      status: "pending",
      billingMode: "pix_one_off",
      mandateId: null,
      copiaECola: "00020126",
      qrCode: null,
      idempotencyKey: draft.idempotencyKey,
      accessActive: false,
    });
    await store.insertCharge({
      providerChargeId: ids.oldChargeId,
      buyerId: fan.id,
      creatorId: ids.creatorId,
      purpose: "post",
      subjectId: `post-${suffix}`,
      description: "old",
      amountCents: 100,
      currency: "BRL",
      status: "pending",
      billingMode: "pix_one_off",
      mandateId: null,
      copiaECola: null,
      qrCode: null,
      idempotencyKey: `old-${suffix}`,
      accessActive: false,
    });
    await database.paymentRecord.update({
      where: { providerChargeId: ids.oldChargeId },
      data: { createdAt: new Date(now.getTime() - EXPAY_PENDING_WINDOW_MS) },
    });

    const listed = await listPendingExpayChargeIds(now);
    expect(listed).toContain(ids.chargeId);
    expect(listed).not.toContain(ids.oldChargeId);

    const paidCharge = {
      id: ids.chargeId,
      status: "paid" as const,
      amountCents: draft.amountCents,
      copiaECola: "00020126",
      qrCode: null,
    };
    const client: ExpayClient = {
      createCharge: async () => paidCharge,
      getCharge: async (id) => {
        if (id === ids.oldChargeId) throw new Error("stale charge was synced");
        if (id !== ids.chargeId) {
          return { id, status: "pending" as const, amountCents: null, copiaECola: null, qrCode: null };
        }
        return paidCharge;
      },
      refundCharge: async () => undefined,
      createMandate: async () => ({ id: "mandate", status: "active", charge: null }),
      getMandate: async () => ({ id: "mandate", status: "active", charge: null }),
      createMandateCharge: async () => paidCharge,
    };

    const first = await reconcilePendingExpayCharges({
      client,
      store,
      now,
      listIds: async () => [ids.chargeId],
    });
    expect(first).toMatchObject({ checked: 1, synced: 1 });
    const subscription = await database.subscription.findUniqueOrThrow({
      where: { fanId_creatorId: { fanId: fan.id, creatorId: ids.creatorId } },
    });
    expect(subscription.status).toBe("ACTIVE");
    expect((await database.purchase.findUnique({ where: { id: purchase.id } }))?.status).toBe("PAID");
    expect((await database.paymentRecord.findUnique({ where: { providerChargeId: ids.oldChargeId } }))?.status).toBe("pending");

    const messages = await database.message.findMany({ where: { conversation: { fanId: fan.id } } });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toBe(paymentNoticeCopy("fr").body);
    expect(messages[0]?.senderId).toBe(creatorUser.id);
    const notice = await database.paymentEvent.findUnique({
      where: { provider_providerId: { provider: "expay", providerId: `paid-notice:${ids.chargeId}` } },
    });
    expect(notice?.processedAt).toBeTruthy();

    await reconcilePendingExpayCharges({
      client,
      store,
      now,
      listIds: async () => [ids.chargeId],
    });
    const again = await notifyBuyerOfPaidCharge({
      providerChargeId: ids.chargeId,
      buyerId: fan.id,
      creatorId: ids.creatorId,
    });
    expect(again.duplicate).toBe(true);
    expect(await database.message.count({ where: { conversation: { fanId: fan.id } } })).toBe(1);
    const unseen = await listBuyerPaymentAlerts(fan.id, now);
    expect(unseen.map((item) => item.chargeId)).toContain(ids.chargeId);
    expect(await markPaymentAlertSeen(fan.id, ids.chargeId)).toEqual({ ok: true });
    expect(await markPaymentAlertSeen(fan.id, ids.chargeId)).toEqual({ ok: true });
    expect((await listBuyerPaymentAlerts(fan.id, now)).map((item) => item.chargeId)).not.toContain(ids.chargeId);
    expect(await markPaymentAlertSeen(ids.creatorUserId, ids.chargeId)).toEqual({ ok: false });
    expect(await syncChargeFromExpay(client, store, ids.chargeId)).toMatchObject({ status: "paid", accessActive: true });
  });

  it("activates the subscription when a Stripe payment intent succeeds", async () => {
    const fan = await database.user.create({
      data: {
        email: `pix-stripe-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        locale: "en",
        profile: { create: { name: "Fan Stripe", username: `pixstripe${suffix}` } },
      },
    });
    const loose = await database.user.create({
      data: {
        email: `pix-loose-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Fan Loose", username: `pixloose${suffix}` } },
      },
    });
    ids.stripeFanId = fan.id;
    ids.looseFanId = loose.id;
    const draft = await chargeDraftForUser(fan, {
      creatorId: ids.creatorId,
      purpose: "subscription",
      subjectId: ids.planId,
      idempotencyKey: `stripe-pix-${suffix}`,
      amountCents: 1,
    });
    const purchase = await ensureQuotedPurchase(draft);
    ids.purchaseIds.push(purchase.id);
    expect(purchase.subscriptionId).toBeTruthy();

    await handleStripeEvent({
      id: `evt-zero-${suffix}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi-zero-${suffix}`,
          amount: purchase.amountCents,
          amount_received: 0,
          metadata: { purchaseId: purchase.id, userId: fan.id },
        },
      },
    });
    expect((await database.purchase.findUnique({ where: { id: purchase.id } }))?.status).toBe("PAID");
    expect((await database.subscription.findUnique({ where: { id: purchase.subscriptionId! } }))?.status).toBe("ACTIVE");

    await handleStripeEvent({
      id: `evt-zero-${suffix}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi-zero-${suffix}`,
          amount: purchase.amountCents,
          amount_received: 0,
          metadata: { purchaseId: purchase.id, userId: fan.id },
        },
      },
    });
    expect(await database.subscription.count({ where: { fanId: fan.id, creatorId: ids.creatorId, status: "ACTIVE" } })).toBe(1);

    const looseDraft = await chargeDraftForUser(loose, {
      creatorId: ids.creatorId,
      purpose: "subscription",
      subjectId: ids.planId,
      idempotencyKey: `stripe-loose-${suffix}`,
      amountCents: 1,
    });
    const loosePurchase = await ensureQuotedPurchase(looseDraft);
    ids.purchaseIds.push(loosePurchase.id);
    await database.purchase.update({ where: { id: loosePurchase.id }, data: { subscriptionId: null } });
    await handleStripeEvent({
      id: `evt-loose-${suffix}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi-loose-${suffix}`,
          amount: loosePurchase.amountCents,
          amount_received: loosePurchase.amountCents,
          metadata: { purchaseId: loosePurchase.id },
        },
      },
    });
    const looseSubscription = await database.subscription.findUniqueOrThrow({
      where: { fanId_creatorId: { fanId: loose.id, creatorId: ids.creatorId } },
    });
    expect(looseSubscription.status).toBe("ACTIVE");
    expect((await database.purchase.findUnique({ where: { id: loosePurchase.id } }))?.subscriptionId).toBe(looseSubscription.id);

    const short = await database.purchase.create({
      data: {
        buyerId: fan.id,
        creatorId: ids.creatorId,
        kind: "SUBSCRIPTION",
        amountCents: purchase.amountCents,
        status: "PENDING",
        idempotencyKey: `stripe-short-${suffix}`,
        subscriptionId: purchase.subscriptionId,
      },
    });
    ids.purchaseIds.push(short.id);
    await handleStripeEvent({
      id: `evt-short-${suffix}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi-short-${suffix}`,
          amount: 1,
          amount_received: 0,
          metadata: { purchaseId: short.id },
        },
      },
    });
    expect((await database.purchase.findUnique({ where: { id: short.id } }))?.status).toBe("PENDING");
  });

  it("records a failed ExPay sync without throwing", async () => {
    const store = createPrismaPaymentStore();
    const broken: ExpayClient = {
      createCharge: async () => {
        throw new Error("unused");
      },
      getCharge: async () => {
        throw new Error("expay down");
      },
      refundCharge: async () => undefined,
      createMandate: async () => ({ id: "m", status: "active", charge: null }),
      getMandate: async () => ({ id: "m", status: "active", charge: null }),
      createMandateCharge: async () => {
        throw new Error("unused");
      },
    };
    await expect(
      reconcilePendingExpayCharges({
        client: broken,
        store,
        listIds: async () => [`missing-${suffix}`],
      }),
    ).resolves.toMatchObject({ checked: 1, synced: 0 });
  });
});
