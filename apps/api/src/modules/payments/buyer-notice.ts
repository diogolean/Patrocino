import { database, Prisma } from "@mimelux/db/runtime";
import webpush from "web-push";
import { readResendConfig, sendResendEmail } from "../auth/email-sender";
import { ensureWebPush } from "../notifications/fan-notify";
import { deliverPush, readVapidConfig, type PushPayload } from "../notifications/push";
import { logPayment } from "./payment-log";

const copy = {
  "pt-BR": {
    title: "Pagamento confirmado",
    body: "Seu pagamento foi confirmado e o acesso já está liberado.",
    subject: "Pagamento confirmado no Patrocino",
  },
  en: {
    title: "Payment confirmed",
    body: "Your payment is confirmed and access is now open.",
    subject: "Payment confirmed on Patrocino",
  },
  es: {
    title: "Pago confirmado",
    body: "Tu pago fue confirmado y el acceso ya está liberado.",
    subject: "Pago confirmado en Patrocino",
  },
  de: {
    title: "Zahlung bestätigt",
    body: "Deine Zahlung ist bestätigt und der Zugang ist frei.",
    subject: "Zahlung bestätigt bei Patrocino",
  },
  fr: {
    title: "Paiement confirmé",
    body: "Votre paiement est confirmé et l'accès est ouvert.",
    subject: "Paiement confirmé sur Patrocino",
  },
} as const;

type NoticeLocale = keyof typeof copy;

export function paymentNoticeCopy(locale?: string | null) {
  if (locale && locale in copy) return copy[locale as NoticeLocale];
  if (locale?.toLowerCase().startsWith("pt")) return copy["pt-BR"];
  const short = locale?.slice(0, 2);
  if (short && short in copy) return copy[short as NoticeLocale];
  return copy["pt-BR"];
}

export function buildPaymentPushPayload(input: {
  locale?: string | null;
  url: string;
  chargeId: string;
  icon?: string | null;
}): PushPayload {
  const text = paymentNoticeCopy(input.locale);
  const icon = input.icon && input.icon.length <= 500 ? input.icon : "/icons/icon-192.png";
  return {
    title: text.title,
    body: text.body,
    url: input.url,
    icon,
    tag: `payment-${input.chargeId}`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function noticeId(chargeId: string) {
  return `paid-notice:${chargeId}`;
}

async function ensureConversation(fanId: string, creatorId: string, creatorUserId: string) {
  const existing = await database.conversation.findUnique({
    where: { fanId_creatorId: { fanId, creatorId } },
  });
  if (existing) return existing;
  try {
    return await database.conversation.create({
      data: {
        fanId,
        creatorId,
        participantIds: [fanId, creatorUserId],
      },
    });
  } catch (error) {
    if (!isUnique(error)) throw error;
    const raced = await database.conversation.findUnique({
      where: { fanId_creatorId: { fanId, creatorId } },
    });
    if (!raced) throw error;
    return raced;
  }
}

export async function notifyBuyerOfPaidCharge(charge: {
  providerChargeId: string;
  buyerId: string;
  creatorId: string;
}) {
  const providerId = noticeId(charge.providerChargeId);
  try {
    await database.paymentEvent.create({
      data: {
        provider: "expay",
        providerId,
        eventType: "buyer_paid_notice",
        payload: { chargeId: charge.providerChargeId },
      },
    });
  } catch (error) {
    if (isUnique(error)) return { duplicate: true as const, inSite: false, push: 0, email: false };
    throw error;
  }

  const [fan, creator] = await Promise.all([
    database.user.findUnique({ where: { id: charge.buyerId }, select: { email: true, locale: true } }),
    database.creator.findUnique({
      where: { id: charge.creatorId },
      include: { user: { include: { profile: true } } },
    }),
  ]);
  const text = paymentNoticeCopy(fan?.locale);
  const profile = creator?.user.profile;
  const username = profile?.username?.trim();
  const url = username ? `/creator/${encodeURIComponent(username)}` : "/assinaturas";
  let inSite = false;
  let push = 0;
  let email = false;

  if (creator?.userId) {
    try {
      const conversation = await ensureConversation(charge.buyerId, charge.creatorId, creator.userId);
      await database.message.create({
        data: {
          conversationId: conversation.id,
          senderId: creator.userId,
          body: text.body,
        },
      });
      inSite = true;
    } catch (error) {
      logPayment("payment.notice.failed", {
        provider: "expay",
        chargeId: charge.providerChargeId,
        channel: "in_site",
        reason: error instanceof Error ? error.message : "in_site_failed",
      });
    }
  }

  const vapid = readVapidConfig(process.env);
  if (vapid) {
    try {
      const subscriptions = await database.pushSubscription.findMany({ where: { userId: charge.buyerId } });
      if (subscriptions.length > 0) {
        ensureWebPush(vapid);
        const payload = buildPaymentPushPayload({
          locale: fan?.locale,
          url,
          chargeId: charge.providerChargeId,
          icon: profile?.avatarUrl,
        });
        const result = await deliverPush({
          subscriptions,
          payload,
          send: (subscription, body) => webpush.sendNotification(subscription, body).then(() => undefined),
          remove: async (id) => {
            await database.pushSubscription.delete({ where: { id } });
          },
        });
        push = result.sent;
      }
    } catch (error) {
      logPayment("payment.notice.failed", {
        provider: "expay",
        chargeId: charge.providerChargeId,
        channel: "push",
        reason: error instanceof Error ? error.message : "push_failed",
      });
    }
  }

  const resend = readResendConfig();
  if (resend && fan?.email) {
    try {
      const origin = (process.env.WEB_ORIGIN ?? "http://127.0.0.1:3333").replace(/\/$/, "");
      const safeOrigin = escapeHtml(origin);
      await sendResendEmail(resend, {
        to: fan.email,
        subject: text.subject,
        html: `<p>${escapeHtml(text.body)}</p><p><a href="${safeOrigin}">${safeOrigin}</a></p>`,
      });
      email = true;
    } catch (error) {
      logPayment("payment.notice.failed", {
        provider: "expay",
        chargeId: charge.providerChargeId,
        channel: "email",
        reason: error instanceof Error ? error.message : "email_failed",
      });
    }
  }

  await database.paymentEvent.update({
    where: { provider_providerId: { provider: "expay", providerId } },
    data: { processedAt: new Date(), payload: { chargeId: charge.providerChargeId, inSite, push, email } },
  });
  logPayment("payment.notice.sent", {
    provider: "expay",
    chargeId: charge.providerChargeId,
    inSite,
    push,
    email,
  });
  return { duplicate: false as const, inSite, push, email };
}

export async function notifyUnsentPaidCharges(now = new Date(), windowMs = 48 * 60 * 60 * 1000) {
  const since = new Date(now.getTime() - windowMs);
  const rows = await database.paymentRecord.findMany({
    where: {
      provider: "expay",
      status: "paid",
      accessActive: true,
      OR: [{ paidAt: { gt: since } }, { paidAt: null, updatedAt: { gt: since } }],
    },
    select: { providerChargeId: true, buyerId: true, creatorId: true },
    orderBy: { updatedAt: "asc" },
    take: 40,
  });
  if (rows.length === 0) return { notified: 0 };
  const sent = await database.paymentEvent.findMany({
    where: {
      provider: "expay",
      providerId: { in: rows.map((row) => noticeId(row.providerChargeId)) },
    },
    select: { providerId: true },
  });
  const done = new Set(sent.map((row) => row.providerId));
  let notified = 0;
  for (const row of rows) {
    if (done.has(noticeId(row.providerChargeId))) continue;
    try {
      const result = await notifyBuyerOfPaidCharge(row);
      if (!result.duplicate) notified += 1;
    } catch (error) {
      logPayment("payment.notice.failed", {
        provider: "expay",
        chargeId: row.providerChargeId,
        reason: error instanceof Error ? error.message : "notice_failed",
      });
    }
  }
  return { notified };
}
