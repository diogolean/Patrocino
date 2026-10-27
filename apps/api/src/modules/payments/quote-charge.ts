import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma, database } from "@mimelux/db/runtime";
import { chargeForPlan } from "./plan-price";
import type { ChargeDraft, PaymentPurpose } from "@mimelux/core/expay";
import { z } from "zod";
import { fanSubscribed } from "../media/entitlement";

const purposes = ["subscription", "post", "message", "pack", "special_request"] as const;

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

export const quoteRequestSchema = z.object({
  creatorId: z.string().trim().min(1).max(120),
  purpose: z.enum(purposes),
  subjectId: z.string().trim().min(1).max(120),
});

export const chargeRequestSchema = quoteRequestSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(200),
  customer: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      document: z.string().trim().min(11).max(18).optional(),
    })
    .optional(),
  amountCents: z.unknown().optional(),
  buyerId: z.unknown().optional(),
  description: z.unknown().optional(),
});

export type QuotedCharge = {
  buyerId: string;
  creatorId: string;
  purpose: PaymentPurpose;
  subjectId: string;
  amountCents: number;
  description: string;
};

const unavailable = () => new NotFoundException("This item is not available.");

function clip(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 240 ? trimmed.slice(0, 240) : trimmed;
}

function creatorKeys(creatorKey: string) {
  return Array.from(new Set([creatorKey, creatorKey.replace(/-/g, "")]));
}

async function findCreator(creatorKey: string) {
  const keys = creatorKeys(creatorKey);
  return database.creator.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ id: { in: keys } }, { user: { profile: { is: { username: { in: keys } } } } }],
    },
    include: { user: { include: { profile: true } } },
  });
}

function billable(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new BadRequestException("This item is not billable.");
  }
  return amountCents;
}

export async function quoteCharge(
  user: { id: string },
  input: { creatorId: string; purpose: PaymentPurpose; subjectId: string },
): Promise<QuotedCharge> {
  const creator = await findCreator(input.creatorId);
  if (!creator) throw unavailable();
  const creatorName = creator.user.profile?.name?.trim() || "Criador";

  if (input.purpose === "subscription") {
    const months = planMonths[input.subjectId];
    const plans = await database.plan.findMany({
      where: { creatorId: creator.id, active: true },
      orderBy: { durationMonths: "asc" },
    });
    const plan =
      plans.find((item) => item.id === input.subjectId) ??
      (months ? plans.find((item) => item.durationMonths === months) : undefined);
    if (!plan) throw unavailable();
    const promotions = await database.promotion.findMany({
      where: { creatorId: creator.id, active: true, OR: [{ planId: plan.id }, { planId: null }] },
    });
    const priced = chargeForPlan(plan, promotions);
    return {
      buyerId: user.id,
      creatorId: creator.id,
      purpose: "subscription",
      subjectId: plan.id,
      amountCents: billable(priced.chargeCents),
      description: clip(`${creatorName} · ${plan.name}`),
    };
  }

  if (input.purpose === "post") {
    const post = await database.post.findFirst({
      where: {
        id: input.subjectId,
        creatorId: creator.id,
        deletedAt: null,
        publishedAt: { not: null },
        priceCents: { gt: 0 },
      },
    });
    if (!post?.priceCents) throw unavailable();
    if (post.visibility === "SUBSCRIBER_PPV" && !(await fanSubscribed(user.id, creator.id))) {
      throw new ForbiddenException("An active subscription is required.");
    }
    return {
      buyerId: user.id,
      creatorId: creator.id,
      purpose: "post",
      subjectId: post.id,
      amountCents: billable(post.priceCents),
      description: clip(`Post de ${creatorName}`),
    };
  }

  if (input.purpose === "message") {
    const message = await database.message.findFirst({
      where: { id: input.subjectId, senderId: creator.userId, ppvPriceCents: { gt: 0 } },
    });
    if (!message?.ppvPriceCents) throw unavailable();
    return {
      buyerId: user.id,
      creatorId: creator.id,
      purpose: "message",
      subjectId: message.id,
      amountCents: billable(message.ppvPriceCents),
      description: clip(`Mensagem de ${creatorName}`),
    };
  }

  if (input.purpose === "pack") {
    const pack = await database.contentPack.findFirst({
      where: { id: input.subjectId, creatorId: creator.id, active: true, priceCents: { gt: 0 } },
    });
    if (!pack) throw unavailable();
    return {
      buyerId: user.id,
      creatorId: creator.id,
      purpose: "pack",
      subjectId: pack.id,
      amountCents: billable(pack.priceCents),
      description: clip(pack.name || `Pacote de ${creatorName}`),
    };
  }

  const request = await database.specialRequest.findFirst({
    where: {
      id: input.subjectId,
      creatorId: creator.id,
      fanId: user.id,
      quotedPriceCents: { gt: 0 },
      status: { in: ["QUOTED", "ACCEPTED"] },
    },
  });
  if (!request?.quotedPriceCents) throw unavailable();
  return {
    buyerId: user.id,
    creatorId: creator.id,
    purpose: "special_request",
    subjectId: request.id,
    amountCents: billable(request.quotedPriceCents),
    description: clip(`Pedido para ${creatorName}`),
  };
}

export async function chargeDraftForUser(user: { id: string; email: string }, body: unknown): Promise<ChargeDraft> {
  const parsed = chargeRequestSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException("Invalid payment request.");
  const quote = await quoteCharge(user, parsed.data);
  const profile = await database.profile.findUnique({ where: { userId: user.id } });
  const document = parsed.data.customer?.document?.replace(/\D/g, "") ?? "";
  return {
    buyerId: quote.buyerId,
    creatorId: quote.creatorId,
    purpose: quote.purpose,
    subjectId: quote.subjectId,
    amountCents: quote.amountCents,
    description: quote.description,
    customer: {
      name: profile?.name?.trim() || parsed.data.customer?.name || "Apoiador",
      email: user.email,
      ...(document ? { document } : {}),
    },
    idempotencyKey: parsed.data.idempotencyKey,
  };
}

const purchaseKind = {
  subscription: "SUBSCRIPTION",
  post: "POST",
  message: "MESSAGE",
  pack: "PACK",
  special_request: "SPECIAL_REQUEST",
} as const;

function samePurchase(
  existing: { buyerId: string; creatorId: string; amountCents: number; kind: string },
  draft: ChargeDraft,
) {
  return (
    existing.buyerId === draft.buyerId &&
    existing.creatorId === draft.creatorId &&
    existing.amountCents === draft.amountCents &&
    existing.kind === purchaseKind[draft.purpose]
  );
}

export async function ensureQuotedPurchase(draft: ChargeDraft) {
  const existing = await database.purchase.findUnique({ where: { idempotencyKey: draft.idempotencyKey } });
  if (existing) {
    if (!samePurchase(existing, draft)) throw new ConflictException("Idempotency key already used.");
    return existing;
  }

  let subscriptionId: string | undefined;
  if (draft.purpose === "subscription") {
    const current = await database.subscription.findUnique({
      where: { fanId_creatorId: { fanId: draft.buyerId, creatorId: draft.creatorId } },
    });
    if (current) {
      subscriptionId = current.id;
    } else {
      const created = await database.subscription.create({
        data: {
          fanId: draft.buyerId,
          creatorId: draft.creatorId,
          planId: draft.subjectId,
          status: "PENDING",
        },
      });
      subscriptionId = created.id;
    }
  }

  try {
    const purchase = await database.purchase.create({
      data: {
        buyerId: draft.buyerId,
        creatorId: draft.creatorId,
        kind: purchaseKind[draft.purpose],
        amountCents: draft.amountCents,
        currency: "BRL",
        status: "PENDING",
        idempotencyKey: draft.idempotencyKey,
        ...(draft.purpose === "post" ? { postId: draft.subjectId } : {}),
        ...(draft.purpose === "message" ? { messageId: draft.subjectId } : {}),
        ...(draft.purpose === "pack" ? { contentPackId: draft.subjectId } : {}),
        ...(subscriptionId ? { subscriptionId } : {}),
      },
    });
    if (draft.purpose === "special_request") {
      await database.specialRequest.updateMany({
        where: { id: draft.subjectId, fanId: draft.buyerId, purchaseId: null },
        data: { purchaseId: purchase.id },
      });
    }
    return purchase;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const raced = await database.purchase.findUnique({ where: { idempotencyKey: draft.idempotencyKey } });
    if (!raced || !samePurchase(raced, draft)) throw new ConflictException("Idempotency key already used.");
    return raced;
  }
}
