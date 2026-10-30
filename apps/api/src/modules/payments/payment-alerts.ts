import { database, Prisma } from "@mimelux/db/runtime";
import { EXPAY_PENDING_WINDOW_MS } from "./expay-sync";

export type BuyerPaymentAlert = {
  chargeId: string;
  status: string;
  accessActive: boolean;
  purpose: string;
  creatorId: string;
};

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function alertSeenId(chargeId: string) {
  return `alert-seen:${chargeId}`;
}

export async function listBuyerPaymentAlerts(buyerId: string, now = new Date()): Promise<BuyerPaymentAlert[]> {
  const since = new Date(now.getTime() - EXPAY_PENDING_WINDOW_MS);
  const charges = await database.paymentRecord.findMany({
    where: {
      provider: "expay",
      buyerId,
      createdAt: { gt: since },
      OR: [{ status: "pending" }, { status: "paid", accessActive: true }],
    },
    select: {
      providerChargeId: true,
      status: true,
      accessActive: true,
      purpose: true,
      creatorId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const seenIds = charges.filter((charge) => charge.accessActive).map((charge) => alertSeenId(charge.providerChargeId));
  const seen = seenIds.length
    ? await database.paymentEvent.findMany({
        where: { provider: "expay", providerId: { in: seenIds } },
        select: { providerId: true },
      })
    : [];
  const seenSet = new Set(seen.map((row) => row.providerId));
  return charges
    .filter((charge) => !charge.accessActive || !seenSet.has(alertSeenId(charge.providerChargeId)))
    .map((charge) => ({
      chargeId: charge.providerChargeId,
      status: charge.status,
      accessActive: charge.accessActive,
      purpose: charge.purpose,
      creatorId: charge.creatorId,
    }));
}

export async function markPaymentAlertSeen(buyerId: string, chargeId: string) {
  const charge = await database.paymentRecord.findUnique({ where: { providerChargeId: chargeId } });
  if (!charge || charge.buyerId !== buyerId || charge.status !== "paid" || !charge.accessActive) return { ok: false as const };
  try {
    await database.paymentEvent.create({
      data: {
        provider: "expay",
        providerId: alertSeenId(chargeId),
        eventType: "buyer_alert_seen",
        payload: { chargeId, alertSeenAt: new Date().toISOString() },
        processedAt: new Date(),
      },
    });
  } catch (error) {
    if (!isUnique(error)) throw error;
  }
  return { ok: true as const };
}
