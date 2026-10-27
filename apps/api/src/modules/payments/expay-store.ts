import { database, Prisma } from "@mimelux/db/runtime";
import { cancelPendingChatSequence, enqueueChatSequence } from "../chat/sequence";
import { laterInstant } from "./subscription-status";
import {
  billingModes,
  chargeStatuses,
  paymentPurposes,
  type BillingMode,
  type ChargeRecord,
  type ChargeStatus,
  type PaymentPurpose,
  type PaymentStore,
  type ReceiptRecord,
} from "@mimelux/core/expay";

function toReceipt(row: {
  providerEventId: string;
  providerChargeId: string;
  eventType: string;
  environment: string;
  processedAt: Date | null;
}): ReceiptRecord {
  return {
    providerEventId: row.providerEventId,
    providerChargeId: row.providerChargeId,
    eventType: row.eventType,
    environment: row.environment === "test" ? "test" : "prod",
    processedAt: row.processedAt?.toISOString() ?? null,
  };
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function asStatus(value: string): ChargeStatus {
  return chargeStatuses.includes(value as ChargeStatus) ? (value as ChargeStatus) : "pending";
}

function asMode(value: string): BillingMode {
  return billingModes.includes(value as BillingMode) ? (value as BillingMode) : "pix_one_off";
}

function asPurpose(value: string): PaymentPurpose {
  return paymentPurposes.includes(value as PaymentPurpose) ? (value as PaymentPurpose) : "post";
}

function toCharge(row: {
  providerChargeId: string;
  buyerId: string;
  creatorId: string;
  purpose: string;
  subjectId: string;
  description: string;
  amountCents: number;
  currency: string;
  status: string;
  billingMode: string;
  mandateId: string | null;
  copiaECola: string | null;
  qrCode: string | null;
  idempotencyKey: string;
  accessActive: boolean;
}): ChargeRecord {
  return {
    providerChargeId: row.providerChargeId,
    buyerId: row.buyerId,
    creatorId: row.creatorId,
    purpose: asPurpose(row.purpose),
    subjectId: row.subjectId,
    description: row.description,
    amountCents: row.amountCents,
    currency: "BRL",
    status: asStatus(row.status),
    billingMode: asMode(row.billingMode),
    mandateId: row.mandateId,
    copiaECola: row.copiaECola,
    qrCode: row.qrCode,
    idempotencyKey: row.idempotencyKey,
    accessActive: row.accessActive,
  };
}

async function syncPurchase(row: { idempotencyKey: string; status: string; accessActive: boolean }) {
  const status = row.accessActive ? "PAID" : row.status === "failed" ? "FAILED" : row.status === "refunded" || row.status === "canceled" ? "REFUNDED" : "PENDING";
  await database.purchase.updateMany({
    where: { idempotencyKey: row.idempotencyKey },
    data: { status },
  });
}

async function syncSubscription(row: {
  buyerId: string;
  creatorId: string;
  purpose: string;
  subjectId: string;
  status: string;
  accessActive: boolean;
}) {
  if (row.purpose !== "subscription") return;
  const [fan, creator, plan] = await Promise.all([
    database.user.findUnique({ where: { id: row.buyerId } }),
    database.creator.findUnique({ where: { id: row.creatorId } }),
    database.plan.findUnique({ where: { id: row.subjectId } }),
  ]);
  if (!fan || !creator || !plan) return;
  const existing = await database.subscription.findUnique({
    where: { fanId_creatorId: { fanId: fan.id, creatorId: creator.id } },
  });
  if (row.accessActive) {
    const computedEnd = new Date();
    computedEnd.setMonth(computedEnd.getMonth() + plan.durationMonths);
    const endsAt = laterInstant(laterInstant(existing?.endsAt, computedEnd), existing?.currentPeriodEnd ?? computedEnd);
    const now = new Date();
    const subscription = await database.subscription.upsert({
      where: { fanId_creatorId: { fanId: fan.id, creatorId: creator.id } },
      create: {
        fanId: fan.id,
        creatorId: creator.id,
        planId: plan.id,
        status: "ACTIVE",
        startsAt: now,
        endsAt,
        currentPeriodEnd: endsAt,
      },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        startsAt: existing?.startsAt ?? now,
        endsAt,
        currentPeriodEnd: endsAt,
      },
    });
    if (existing?.status !== "ACTIVE") await enqueueChatSequence(database, subscription.id);
    return;
  }
  if (row.status === "refunded" || row.status === "canceled") {
    await database.subscription.updateMany({
      where: { fanId: fan.id, creatorId: creator.id, status: "ACTIVE" },
      data: { status: "CANCELED" },
    });
    if (existing) await cancelPendingChatSequence(database, existing.id);
  }
}

export function createPrismaPaymentStore(): PaymentStore {
  return {
    async findByIdempotency(key) {
      const row = await database.paymentRecord.findUnique({ where: { idempotencyKey: key } });
      return row ? toCharge(row) : null;
    },
    async findByProviderChargeId(id) {
      const row = await database.paymentRecord.findUnique({ where: { providerChargeId: id } });
      return row ? toCharge(row) : null;
    },
    async insertCharge(charge) {
      try {
        const row = await database.paymentRecord.create({ data: charge });
        return toCharge(row);
      } catch (error) {
        if (!isUnique(error)) throw error;
        const existing = await database.paymentRecord.findUnique({ where: { idempotencyKey: charge.idempotencyKey } });
        if (!existing) throw error;
        return toCharge(existing);
      }
    },
    async saveStatus(providerChargeId, status, accessActive) {
      const current = await database.paymentRecord.findUnique({ where: { providerChargeId } });
      if (!current) throw new Error("unknown_charge");
      const row = await database.paymentRecord.update({
        where: { providerChargeId },
        data: {
          status,
          accessActive,
          paidAt: status === "paid" ? current.paidAt ?? new Date() : current.paidAt,
          revokedAt: current.accessActive && !accessActive ? new Date() : current.revokedAt,
        },
      });
      await syncPurchase(row);
      await syncSubscription(row);
      return toCharge(row);
    },
    async findReceipt(eventId, environment) {
      const row = await database.paymentWebhookReceipt.findUnique({
        where: {
          provider_providerEventId_environment: { provider: "expay", providerEventId: eventId, environment },
        },
      });
      if (!row) return null;
      return toReceipt(row);
    },
    async insertReceipt(receipt) {
      try {
        const row = await database.paymentWebhookReceipt.create({
          data: {
            provider: "expay",
            providerEventId: receipt.providerEventId,
            providerChargeId: receipt.providerChargeId,
            eventType: receipt.eventType,
            environment: receipt.environment,
            payload: receipt.payload as Prisma.InputJsonValue,
            processedAt: receipt.processedAt ? new Date(receipt.processedAt) : null,
          },
        });
        return toReceipt(row);
      } catch (error) {
        if (!isUnique(error)) throw error;
        const existing = await database.paymentWebhookReceipt.findUnique({
          where: {
            provider_providerEventId_environment: {
              provider: "expay",
              providerEventId: receipt.providerEventId,
              environment: receipt.environment,
            },
          },
        });
        if (!existing) throw error;
        return toReceipt(existing);
      }
    },
    async saveMandate(mandate) {
      await database.pixMandateRecord.upsert({
        where: { providerMandateId: mandate.providerMandateId },
        create: mandate,
        update: { status: mandate.status, amountCents: mandate.amountCents },
      });
    },
  };
}
