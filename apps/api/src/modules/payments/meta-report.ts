import { database } from "@mimelux/db/runtime";
import { deliverCapiPurchase, readMetaCapiConfig, redactSecret } from "@mimelux/core/meta-capi";
import { logPayment } from "./payment-log";

/** Fire-and-forget. Never throws to the payment path. */
export function queueMetaPurchase(purchaseId: string) {
  void reportSettledPurchase(purchaseId).catch((error: unknown) => {
    const token = process.env.META_CAPI_ACCESS_TOKEN?.trim() ?? "";
    const reason = error instanceof Error ? error.message : "capi_failed";
    logPayment("meta.capi.failed", { provider: "meta", chargeId: purchaseId, reason: redactSecret(reason, token) });
  });
}

async function reportSettledPurchase(purchaseId: string) {
  const config = readMetaCapiConfig(process.env);
  if (!config) return;
  const purchase = await database.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      buyer: { select: { email: true } },
      creator: { select: { user: { select: { profile: { select: { username: true } } } } } },
    },
  });
  if (!purchase || purchase.status !== "PAID" || purchase.metaCapiSentAt) return;
  const origin = (process.env.WEB_ORIGIN ?? "https://patrocino.com").replace(/\/$/, "");
  const result = await deliverCapiPurchase({
    config,
    purchase: {
      eventId: purchase.id,
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl: `${origin}/checkout`,
      email: purchase.buyer.email,
      amountCents: purchase.amountCents,
      currency: purchase.currency,
      kind: purchase.kind,
      contentId: purchase.creator.user.profile?.username || purchase.creatorId,
      clientIp: purchase.clientIp,
      clientUserAgent: purchase.clientUserAgent,
      fbp: purchase.fbp,
      fbc: purchase.fbc,
    },
    claim: async () => {
      const updated = await database.purchase.updateMany({
        where: { id: purchase.id, status: "PAID", metaCapiSentAt: null },
        data: { metaCapiSentAt: new Date() },
      });
      return updated.count === 1;
    },
  });
  const event = result === "sent" ? "meta.capi.sent" : result === "failed" ? "meta.capi.failed" : "meta.capi.skipped";
  logPayment(event, {
    provider: "meta",
    chargeId: purchase.id,
    result,
    kind: purchase.kind,
  });
}
