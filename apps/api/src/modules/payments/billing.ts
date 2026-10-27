import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, database } from "@mimelux/db/runtime";
import { planChargeCents, reverseLedger, splitRevenue, subscriptionGrantsAccess } from "@mimelux/core/monetization";
import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { paymentProvider, readStripeSecret } from "./payment-gateways";
import { quoteCharge } from "./quote-charge";

type Tx = Prisma.TransactionClient;
type AccountUser = { id: string; email: string; stripeCustomerId: string | null };

const planMonths: Record<string, number> = {
  monthly: 1,
  mensal: 1,
  "1": 1,
  quarterly: 3,
  "3": 3,
  semiannual: 6,
  "6": 6,
  yearly: 12,
  "12": 12,
};

function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function webOrigin() {
  return (process.env.WEB_ORIGIN ?? "http://127.0.0.1:3333").replace(/\/$/, "");
}

export async function resolvePlan(creatorKey: string, planKey: string) {
  const keys = Array.from(new Set([creatorKey, creatorKey.replace(/-/g, "")]));
  const creator = await database.creator.findFirst({
    where: {
      OR: [
        { id: { in: keys } },
        { user: { profile: { is: { username: { in: keys } } } } },
      ],
    },
    include: {
      plans: { where: { active: true }, orderBy: { durationMonths: "asc" } },
      user: { include: { profile: true } },
    },
  });
  if (!creator) return null;
  const months = planMonths[planKey];
  const plan =
    creator.plans.find((item) => item.id === planKey) ??
    (months ? creator.plans.find((item) => item.durationMonths === months) : undefined);
  if (!plan) return null;
  return { creator, plan };
}

async function settingsOf(tx: Tx) {
  return tx.platformSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", creatorShareBps: 8000, affiliateCommissionBps: 2000 },
  });
}

function sharesFor(
  settings: { creatorShareBps: number; affiliateCommissionBps: number },
  creator: { ownership: "HOUSE" | "INDEPENDENT"; creatorShareBps: number | null; affiliateCommissionBps: number | null },
) {
  return {
    ownership: creator.ownership,
    creatorShareBps: creator.creatorShareBps ?? settings.creatorShareBps,
    affiliateCommissionBps: creator.affiliateCommissionBps ?? settings.affiliateCommissionBps,
  };
}

async function referralFor(tx: Tx, fanId: string, creatorId: string) {
  return tx.attribution.findFirst({
    where: {
      fanId,
      expiresAt: { gt: new Date() },
      blockedReason: null,
      click: { link: { creatorId } },
    },
    include: { click: { include: { link: { include: { affiliate: true } } } } },
  });
}

export async function settlePurchase(tx: Tx, purchaseId: string, reference: string) {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    include: { creator: true },
  });
  if (!purchase || purchase.status !== "PENDING") return purchase;
  const settings = await settingsOf(tx);
  const shares = sharesFor(settings, purchase.creator);
  const referral = await referralFor(tx, purchase.buyerId, purchase.creatorId);
  const entries = splitRevenue({
    grossCents: purchase.amountCents,
    ownership: shares.ownership,
    creatorShareBps: shares.creatorShareBps,
    affiliateCommissionBps: shares.affiliateCommissionBps,
    referred: Boolean(referral),
  });
  const affiliateCents = entries.find((entry) => entry.account === "affiliate_payable")?.amountCents ?? 0;
  await tx.purchase.update({ where: { id: purchase.id }, data: { status: "PAID" } });
  await tx.ledgerEntry.createMany({
    data: entries.map((entry) => ({
      purchaseId: purchase.id,
      creatorId: entry.account === "creator_payable" ? purchase.creatorId : null,
      userId: entry.account === "affiliate_payable" && referral ? referral.click.link.affiliate.userId : null,
      direction: entry.direction,
      account: entry.account,
      amountCents: entry.amountCents,
      currency: purchase.currency,
      reference,
    })),
  });
  if (referral && affiliateCents > 0) {
    const kind = purchase.kind === "SUBSCRIPTION" ? "subscription" : "ppv";
    const conversion = await tx.conversion.create({
      data: {
        attributionId: referral.id,
        purchaseId: purchase.id,
        kind,
        amountCents: purchase.amountCents,
        currency: purchase.currency,
        isDemo: purchase.isDemo,
      },
    });
    await tx.commission.create({
      data: {
        affiliateId: referral.click.link.affiliateId,
        conversionId: conversion.id,
        rateBps: shares.affiliateCommissionBps,
        amountCents: affiliateCents,
        currency: purchase.currency,
        holdUntil: new Date(Date.now() + 10 * 86_400_000),
        renewalUntil: new Date(Date.now() + 365 * 86_400_000),
        isDemo: purchase.isDemo,
      },
    });
  }
  return purchase;
}

async function reversePurchase(tx: Tx, purchaseId: string, reference: string) {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    include: { ledgerEntries: true },
  });
  if (!purchase || purchase.status === "REFUNDED" || purchase.status === "FAILED") return;
  if (purchase.status === "PAID") {
    const originals = purchase.ledgerEntries.filter((entry) => !entry.reference.startsWith("refund:"));
    const reversed = reverseLedger(
      originals.map((entry) => ({
        direction: entry.direction,
        account: entry.account as "platform_cash" | "creator_payable" | "affiliate_payable" | "platform_revenue",
        amountCents: entry.amountCents,
      })),
    );
    if (reversed.length) {
      await tx.ledgerEntry.createMany({
        data: reversed.map((entry) => ({
          purchaseId: purchase.id,
          creatorId: entry.account === "creator_payable" ? purchase.creatorId : null,
          userId: originals.find((item) => item.account === entry.account)?.userId ?? null,
          direction: entry.direction,
          account: entry.account,
          amountCents: entry.amountCents,
          currency: purchase.currency,
          reference,
        })),
      });
    }
  }
  await tx.purchase.update({ where: { id: purchase.id }, data: { status: "REFUNDED" } });
  if (purchase.subscriptionId) {
    const now = new Date();
    await tx.subscription.update({
      where: { id: purchase.subscriptionId },
      data: { status: "CANCELED", currentPeriodEnd: now, endsAt: now, cancelAtPeriodEnd: false },
    });
  }
}

function presentSubscription(row: {
  id: string;
  creatorId: string;
  planId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  endsAt: Date | null;
  isDemo: boolean;
  plan?: { name: string; priceCents: number; durationMonths: number; discountPercent: number } | null;
  creator?: { user: { profile: { name: string; username: string } | null } } | null;
}) {
  const currentPeriodEnd = row.currentPeriodEnd ?? row.endsAt;
  return {
    id: row.id,
    creatorId: row.creatorId,
    creatorName: row.creator?.user.profile?.name ?? "",
    creatorUsername: row.creator?.user.profile?.username ?? "",
    planId: row.planId,
    planName: row.plan?.name ?? "",
    amountCents: row.plan ? planChargeCents(row.plan) : 0,
    status: row.status,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    currentPeriodEnd,
    access: subscriptionGrantsAccess({ status: row.status, currentPeriodEnd }),
    simulation: row.isDemo,
  };
}

export async function viewerHasAccess(fanId: string, creatorId: string) {
  const row = await database.subscription.findUnique({
    where: { fanId_creatorId: { fanId, creatorId } },
  });
  if (!row) return false;
  return subscriptionGrantsAccess({
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd ?? row.endsAt,
  });
}

export async function listMySubscriptions(userId: string) {
  const rows = await database.subscription.findMany({
    where: { fanId: userId },
    include: { plan: true, creator: { include: { user: { include: { profile: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return { items: rows.map(presentSubscription), source: "postgres" };
}

export async function cancelSubscription(userId: string, subscriptionId: string) {
  const row = await database.subscription.findFirst({ where: { id: subscriptionId, fanId: userId } });
  if (!row) throw new BadRequestException("Subscription not found");
  const secret = readStripeSecret();
  if (row.stripeSubscriptionId && secret.ok) {
    const stripe = new Stripe(secret.key);
    await stripe.subscriptions.update(row.stripeSubscriptionId, { cancel_at_period_end: true });
  }
  const updated = await database.subscription.update({
    where: { id: row.id },
    data: { cancelAtPeriodEnd: true },
    include: { plan: true, creator: { include: { user: { include: { profile: true } } } } },
  });
  return { subscription: presentSubscription(updated) };
}

async function openPurchase(
  userId: string,
  creatorId: string,
  amountCents: number,
  subscriptionId: string | undefined,
  isDemo: boolean,
) {
  return database.purchase.create({
    data: {
      buyerId: userId,
      creatorId,
      kind: "SUBSCRIPTION",
      amountCents,
      currency: "BRL",
      status: "PENDING",
      subscriptionId,
      isDemo,
      idempotencyKey: `sub-${userId}-${randomBytes(8).toString("hex")}`,
    },
  });
}

async function simulateSubscription(
  user: AccountUser,
  resolved: NonNullable<Awaited<ReturnType<typeof resolvePlan>>>,
  amountCents: number,
) {
  const { creator, plan } = resolved;
  const current = await database.subscription.findUnique({
    where: { fanId_creatorId: { fanId: user.id, creatorId: creator.id } },
    include: { plan: true, creator: { include: { user: { include: { profile: true } } } } },
  });
  if (
    current &&
    subscriptionGrantsAccess({ status: current.status, currentPeriodEnd: current.currentPeriodEnd ?? current.endsAt })
  ) {
    return { simulation: true, alreadyActive: true, subscription: presentSubscription(current) };
  }
  const periodEnd = addMonths(new Date(), plan.durationMonths);
  const subscription = await database.subscription.upsert({
    where: { fanId_creatorId: { fanId: user.id, creatorId: creator.id } },
    create: {
      fanId: user.id,
      creatorId: creator.id,
      planId: plan.id,
      status: "PENDING",
      isDemo: true,
    },
    update: { planId: plan.id, status: "PENDING", isDemo: true },
  });
  const purchase = await openPurchase(user.id, creator.id, amountCents, subscription.id, true);
  await database.$transaction(async (tx) => {
    await settlePurchase(tx, purchase.id, `demo:${purchase.id}`);
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: periodEnd,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        planId: plan.id,
      },
    });
  });
  const fresh = await database.subscription.findUniqueOrThrow({
    where: { id: subscription.id },
    include: { plan: true, creator: { include: { user: { include: { profile: true } } } } },
  });
  return { simulation: true, alreadyActive: false, subscription: presentSubscription(fresh), purchaseId: purchase.id, amountCents };
}

async function ensureCustomer(stripe: Stripe, user: AccountUser) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create(
    { email: user.email, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await database.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

async function ensurePrice(
  stripe: Stripe,
  plan: { id: string; creatorId: string; name: string; durationMonths: number; stripeProductId: string | null; stripePriceId: string | null },
  creatorName: string,
  amountCents: number,
) {
  if (plan.stripePriceId) {
    try {
      const current = await stripe.prices.retrieve(plan.stripePriceId);
      if (
        current.unit_amount === amountCents &&
        current.currency === "brl" &&
        current.active &&
        (current.recurring?.interval_count ?? 1) === plan.durationMonths
      ) {
        return current.id;
      }
    } catch {
      // The stored price is missing. Create another one from the database amount.
    }
  }
  let productId = plan.stripeProductId;
  if (!productId) {
    const product = await stripe.products.create(
      { name: `${creatorName} · ${plan.name}`, metadata: { planId: plan.id, creatorId: plan.creatorId } },
      { idempotencyKey: `product-${plan.id}` },
    );
    productId = product.id;
  }
  const price = await stripe.prices.create(
    {
      product: productId,
      unit_amount: amountCents,
      currency: "brl",
      recurring: { interval: "month", interval_count: Math.max(1, plan.durationMonths) },
      metadata: { planId: plan.id },
    },
    { idempotencyKey: `price-${plan.id}-${amountCents}-${plan.durationMonths}` },
  );
  await database.plan.update({
    where: { id: plan.id },
    data: { stripeProductId: productId, stripePriceId: price.id },
  });
  return price.id;
}

async function pricedPlan(user: AccountUser, creatorKey: string, planKey: string) {
  let quote;
  try {
    quote = await quoteCharge(user, { creatorId: creatorKey, purpose: "subscription", subjectId: planKey });
  } catch (error) {
    if (error instanceof NotFoundException) throw new BadRequestException("Plan not found");
    throw error;
  }
  const resolved = await resolvePlan(quote.creatorId, quote.subjectId);
  if (!resolved) throw new BadRequestException("Plan not found");
  return { resolved, amountCents: quote.amountCents };
}

export async function startSubscriptionCheckout(user: AccountUser, creatorKey: string, planKey: string) {
  const { resolved, amountCents } = await pricedPlan(user, creatorKey, planKey);
  const secret = readStripeSecret();
  if (!secret.ok) {
    if (secret.reason === "live_disabled") throw new BadRequestException("Live Stripe keys are disabled");
    return simulateSubscription(user, resolved, amountCents);
  }
  const stripe = new Stripe(secret.key);
  const customerId = await ensureCustomer(stripe, user);
  const creatorName = resolved.creator.user.profile?.name ?? "Criador";
  const priceId = await ensurePrice(stripe, resolved.plan, creatorName, amountCents);
  const periodEnd = addMonths(new Date(), resolved.plan.durationMonths);
  const subscription = await database.subscription.upsert({
    where: { fanId_creatorId: { fanId: user.id, creatorId: resolved.creator.id } },
    create: {
      fanId: user.id,
      creatorId: resolved.creator.id,
      planId: resolved.plan.id,
      status: "PENDING",
      currentPeriodEnd: periodEnd,
    },
    update: { planId: resolved.plan.id, status: "PENDING" },
  });
  const purchase = await openPurchase(user.id, resolved.creator.id, amountCents, subscription.id, false);
  const origin = webOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: purchase.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/assinatura/cancelada`,
    locale: "pt-BR",
    metadata: {
      purchaseId: purchase.id,
      userId: user.id,
      creatorId: resolved.creator.id,
      planId: resolved.plan.id,
    },
    subscription_data: {
      metadata: {
        purchaseId: purchase.id,
        userId: user.id,
        creatorId: resolved.creator.id,
        planId: resolved.plan.id,
      },
    },
  });
  return {
    simulation: false,
    url: session.url,
    purchaseId: purchase.id,
    amountCents,
    subscriptionId: subscription.id,
  };
}

export async function startPlanCheckout(
  user: AccountUser,
  input: { provider: "stripe" | "pix" | "crypto"; creatorId: string; planId: string },
) {
  const { resolved, amountCents } = await pricedPlan(user, input.creatorId, input.planId);
  const secret = readStripeSecret();
  if (input.provider === "stripe" && !secret.ok) {
    throw new BadRequestException(
      secret.reason === "live_disabled" ? "Live Stripe keys are disabled" : "Stripe is not configured",
    );
  }
  const purchase = await openPurchase(user.id, resolved.creator.id, amountCents, undefined, !secret.ok);
  if (input.provider === "stripe") {
    const checkout = await paymentProvider("stripe").createCheckout({
      purchaseId: purchase.id,
      amountCents,
      currency: "brl",
      description: `${resolved.creator.user.profile?.name ?? "Criador"} · ${resolved.plan.name}`,
    });
    if (checkout.externalId) {
      await database.purchase.update({ where: { id: purchase.id }, data: { providerRef: checkout.externalId } });
    }
    return {
      purchase: { id: purchase.id, buyerId: user.id, creatorId: resolved.creator.id, planId: resolved.plan.id, amountCents, status: "PENDING" },
      ...checkout,
    };
  }
  const checkout = await paymentProvider(input.provider).createCheckout({
    purchaseId: purchase.id,
    amountCents,
    currency: "brl",
    description: resolved.plan.name,
  });
  return {
    purchase: { id: purchase.id, buyerId: user.id, creatorId: resolved.creator.id, planId: resolved.plan.id, amountCents, status: "PENDING" },
    ...checkout,
  };
}

function record(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function metadataOf(object: Record<string, unknown>) {
  const metadata = record(object.metadata);
  const entries = Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return Object.fromEntries(entries);
}

function nestedId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return text((value as { id: unknown }).id);
  return undefined;
}

function invoiceSubscriptionId(invoice: Record<string, unknown>) {
  const direct = nestedId(invoice.subscription);
  if (direct) return direct;
  const parent = record(invoice.parent);
  const details = record(parent.subscription_details);
  return nestedId(details.subscription);
}

function invoicePeriodEnd(invoice: Record<string, unknown>) {
  const lines = record(invoice.lines);
  const data = Array.isArray(lines.data) ? lines.data : [];
  const period = record(record(data[0]).period);
  return typeof period.end === "number" ? new Date(period.end * 1000) : null;
}

async function withEvent(
  eventId: string,
  eventType: string,
  payload: unknown,
  purchaseId: string | undefined,
  work: (tx: Tx) => Promise<void>,
) {
  const existing = await database.paymentEvent.findUnique({
    where: { provider_providerId: { provider: "stripe", providerId: eventId } },
  });
  if (existing) return { duplicate: true as const };
  const linkedPurchase = purchaseId
    ? await database.purchase.findUnique({ where: { id: purchaseId }, select: { id: true } })
    : null;
  const storedPurchaseId = linkedPurchase ? purchaseId : undefined;
  try {
    await database.$transaction(async (tx) => {
      await tx.paymentEvent.create({
        data: {
          provider: "stripe",
          providerId: eventId,
          purchaseId: storedPurchaseId,
          eventType,
          payload: payload as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });
      await work(tx);
    });
    return { duplicate: false as const };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { duplicate: true as const };
    }
    throw error;
  }
}

async function activateSubscription(tx: Tx, purchaseId: string, stripeSubscriptionId: string | undefined, periodEnd: Date | null) {
  const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { subscription: { include: { plan: true } } } });
  if (!purchase?.subscriptionId || !purchase.subscription) return;
  const end = periodEnd ?? addMonths(new Date(), purchase.subscription.plan.durationMonths);
  await tx.subscription.update({
    where: { id: purchase.subscriptionId },
    data: {
      status: "ACTIVE",
      startsAt: purchase.subscription.startsAt ?? new Date(),
      endsAt: end,
      currentPeriodEnd: end,
      ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
    },
  });
}

function coversPurchase(expectedCents: number, paid: unknown) {
  return typeof paid === "number" && Number.isInteger(paid) && paid === expectedCents;
}

function paymentIntentCovers(expectedCents: number, object: Record<string, unknown>) {
  if (!coversPurchase(expectedCents, object.amount)) return false;
  if (typeof object.amount_received === "number" && object.amount_received !== expectedCents) return false;
  return true;
}

export async function handleStripeEvent(event: { id: string; type: string; data: { object: unknown } }) {
  const object = record(event.data.object);
  const meta = metadataOf(object);
  if (event.type === "checkout.session.completed") {
    const purchaseId = meta.purchaseId;
    if (!purchaseId) return { processed: false, reason: "missing_purchase_id" };
    const result = await withEvent(event.id, event.type, event, purchaseId, async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
      if (!purchase || (meta.userId && meta.userId !== purchase.buyerId)) return;
      if (!coversPurchase(purchase.amountCents, object.amount_total)) return;
      await settlePurchase(tx, purchase.id, event.id);
      if (text(object.mode) === "subscription" || purchase.subscriptionId) {
        await activateSubscription(tx, purchase.id, nestedId(object.subscription), null);
      }
    });
    return { processed: true, ...result };
  }
  if (event.type === "invoice.paid") {
    const subscriptionId = invoiceSubscriptionId(object);
    const paymentIntent = nestedId(object.payment_intent);
    const result = await withEvent(event.id, event.type, event, meta.purchaseId, async (tx) => {
      const reason = text(object.billing_reason);
      const periodEnd = invoicePeriodEnd(object);
      let purchaseId = meta.purchaseId;
      if (!purchaseId && subscriptionId) {
        const subscription = await tx.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
        const linked = subscription
          ? await tx.purchase.findFirst({ where: { subscriptionId: subscription.id }, orderBy: { createdAt: "desc" } })
          : null;
        purchaseId = linked?.id;
      }
      if (purchaseId && reason !== "subscription_cycle") {
        const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
        if (purchase && (!meta.userId || meta.userId === purchase.buyerId)) {
          if (!coversPurchase(purchase.amountCents, object.amount_paid)) return;
          if (paymentIntent) await tx.purchase.update({ where: { id: purchase.id }, data: { providerRef: paymentIntent } });
          await settlePurchase(tx, purchase.id, event.id);
          await activateSubscription(tx, purchase.id, subscriptionId, periodEnd);
        }
      }
      if ((reason === "subscription_cycle" || reason === "subscription_update") && subscriptionId) {
        const subscription = await tx.subscription.findUnique({
          where: { stripeSubscriptionId: subscriptionId },
          include: { plan: true },
        });
        if (subscription) {
          const expectedCents = planChargeCents(subscription.plan);
          if (!coversPurchase(expectedCents, object.amount_paid)) return;
          const idempotencyKey = `invoice:${text(object.id) ?? event.id}`;
          const existing = await tx.purchase.findUnique({ where: { idempotencyKey } });
          if (!existing) {
            const created = await tx.purchase.create({
              data: {
                buyerId: subscription.fanId,
                creatorId: subscription.creatorId,
                kind: "SUBSCRIPTION",
                amountCents: expectedCents,
                currency: "BRL",
                status: "PENDING",
                subscriptionId: subscription.id,
                providerRef: paymentIntent,
                idempotencyKey,
              },
            });
            await settlePurchase(tx, created.id, event.id);
          }
          if (periodEnd) {
            await tx.subscription.update({
              where: { id: subscription.id },
              data: { status: "ACTIVE", currentPeriodEnd: periodEnd, endsAt: periodEnd },
            });
          }
        }
      }
    });
    return { processed: true, ...result };
  }
  if (event.type === "invoice.payment_failed") {
    const subscriptionId = invoiceSubscriptionId(object);
    const result = await withEvent(event.id, event.type, event, meta.purchaseId, async (tx) => {
      if (meta.purchaseId) {
        await tx.purchase.updateMany({ where: { id: meta.purchaseId, status: "PENDING" }, data: { status: "FAILED" } });
      }
      if (subscriptionId) {
        await tx.subscription.updateMany({ where: { stripeSubscriptionId: subscriptionId }, data: { status: "PAST_DUE" } });
      }
    });
    return { processed: true, ...result };
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const stripeSubscriptionId = text(object.id);
    if (!stripeSubscriptionId) return { processed: false, reason: "missing_subscription" };
    const status = event.type === "customer.subscription.deleted" ? "CANCELED" : mapStripeStatus(text(object.status));
    const periodEnd = typeof object.current_period_end === "number" ? new Date(object.current_period_end * 1000) : null;
    const result = await withEvent(event.id, event.type, event, undefined, async (tx) => {
      await tx.subscription.updateMany({
        where: { stripeSubscriptionId },
        data: {
          status,
          cancelAtPeriodEnd: object.cancel_at_period_end === true,
          ...(periodEnd ? { currentPeriodEnd: periodEnd, endsAt: periodEnd } : {}),
        },
      });
    });
    return { processed: true, ...result };
  }
  if (event.type === "charge.refunded") {
    const paymentIntent = nestedId(object.payment_intent);
    const result = await withEvent(event.id, event.type, event, meta.purchaseId, async (tx) => {
      const byIntent = paymentIntent ? await tx.purchase.findFirst({ where: { providerRef: paymentIntent } }) : null;
      const byMeta = !byIntent && meta.purchaseId ? await tx.purchase.findUnique({ where: { id: meta.purchaseId } }) : null;
      const purchase = byIntent ?? byMeta;
      if (purchase) await reversePurchase(tx, purchase.id, `refund:${event.id}`);
    });
    return { processed: true, ...result };
  }
  if (event.type === "payment_intent.payment_failed") {
    const purchaseId = meta.purchaseId;
    if (!purchaseId) return { processed: false, reason: "missing_purchase_id" };
    const result = await withEvent(event.id, event.type, event, purchaseId, async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
      if (!purchase) return;
      if (purchase.status === "PENDING") {
        await tx.purchase.update({ where: { id: purchase.id }, data: { status: "FAILED", providerRef: text(object.id) } });
        return;
      }
      if (purchase.status === "PAID" && purchase.providerRef === text(object.id)) {
        await reversePurchase(tx, purchase.id, `refund:${event.id}`);
        await tx.purchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } });
      }
    });
    return { processed: true, ...result };
  }
  if (event.type === "payment_intent.succeeded") {
    const purchaseId = meta.purchaseId;
    if (!purchaseId) return { processed: false, reason: "missing_purchase_id" };
    const purchase = await database.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) {
      const result = await withEvent(event.id, event.type, event, undefined, async () => undefined);
      return { processed: false, reason: "unknown_purchase", ...result };
    }
    const result = await withEvent(event.id, event.type, event, purchaseId, async (tx) => {
      const current = await tx.purchase.findUnique({ where: { id: purchaseId } });
      if (!current || (meta.userId && meta.userId !== current.buyerId)) return;
      if (!paymentIntentCovers(current.amountCents, object)) return;
      await tx.purchase.update({ where: { id: current.id }, data: { providerRef: text(object.id) ?? current.providerRef } });
      await settlePurchase(tx, current.id, event.id);
      if (current.subscriptionId) await activateSubscription(tx, current.id, undefined, null);
    });
    return { processed: true, ...result };
  }
  await withEvent(event.id, event.type, event, undefined, async () => undefined);
  return { processed: false };
}

function mapStripeStatus(status: string | undefined) {
  if (status === "active" || status === "trialing") return "ACTIVE" as const;
  if (status === "past_due" || status === "unpaid") return "PAST_DUE" as const;
  if (status === "canceled") return "CANCELED" as const;
  if (status === "incomplete_expired") return "EXPIRED" as const;
  return "PENDING" as const;
}
