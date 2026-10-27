import { database } from "@mimelux/db/runtime";
import { subscriptionGrantsAccess } from "@mimelux/core/monetization";

export const DEFAULT_VIDEO_PRICE_CENTS = 100;

export function resolveVideoPrice(input: {
  visibility: string;
  explicitCents?: number | null;
  defaultVideoPriceCents?: number | null;
}) {
  if (input.visibility !== "PPV" && input.visibility !== "SUBSCRIBER_PPV") return null;
  if (typeof input.explicitCents === "number" && Number.isInteger(input.explicitCents) && input.explicitCents > 0) {
    return input.explicitCents;
  }
  if (input.visibility === "SUBSCRIBER_PPV") {
    const fallback = input.defaultVideoPriceCents;
    return typeof fallback === "number" && fallback > 0 ? fallback : DEFAULT_VIDEO_PRICE_CENTS;
  }
  return null;
}

export async function fanSubscribed(fanId: string, creatorId: string) {
  const row = await database.subscription.findUnique({
    where: { fanId_creatorId: { fanId, creatorId } },
  });
  if (!row) return false;
  return subscriptionGrantsAccess({
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd ?? row.endsAt,
  });
}

export async function paidPostPurchase(buyerId: string, postId: string) {
  const purchase = await database.purchase.findFirst({
    where: { buyerId, postId, status: "PAID" },
    select: { id: true },
  });
  return Boolean(purchase);
}

export async function viewerCanReadPost(input: {
  user: { id: string; role: string } | null;
  owns: boolean;
  post: { id: string; creatorId: string; visibility: string; deletedAt: Date | null; publishedAt: Date | null };
}) {
  if (input.user?.role === "ADMIN" || input.owns) return true;
  if (input.post.deletedAt) return false;
  if (input.post.publishedAt && input.post.publishedAt.getTime() > Date.now()) return false;
  if (input.post.visibility === "FREE") return true;
  if (!input.user) return false;
  if (input.post.visibility === "SUBSCRIBERS") return fanSubscribed(input.user.id, input.post.creatorId);
  if (input.post.visibility === "PPV" || input.post.visibility === "SUBSCRIBER_PPV") {
    return paidPostPurchase(input.user.id, input.post.id);
  }
  return false;
}
