import { database } from "@mimelux/db/runtime";
import { centsForCurrency, type ChargeCurrency } from "@mimelux/core/currency";
import { chargeForPlan, type PromotionInput } from "../payments/plan-price";

function keysFor(key: string) {
  return Array.from(new Set([key, key.replace(/-/g, "")]));
}

export async function loadCreatorOffers(key: string, currency: ChargeCurrency = "BRL") {
  const keys = keysFor(key);
  const creator = await database.creator.findFirst({
    where: {
      status: "ACTIVE",
      user: { deletedAt: null },
      OR: [{ id: { in: keys } }, { user: { profile: { is: { username: { in: keys } } } } }],
    },
    include: {
      user: { include: { profile: true } },
      plans: { where: { active: true }, orderBy: { durationMonths: "asc" } },
      promotions: { where: { active: true } },
      contentPacks: { where: { active: true }, orderBy: { createdAt: "asc" } },
      posts: { where: { deletedAt: null }, select: { likeCount: true } },
    },
  });
  if (!creator) return null;
  const promotions: PromotionInput[] = creator.promotions.map((row) => ({
    planId: row.planId,
    name: row.name,
    discountPercent: row.discountPercent,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    subscriberCap: row.subscriberCap,
    redeemedCount: row.redeemedCount,
    active: row.active,
  }));
  const pricedPlans = creator.plans.map((plan) => {
    const sticker = centsForCurrency(currency, plan.priceCents, plan.priceCentsUsd);
    return { plan, priced: chargeForPlan({ ...plan, priceCents: sticker }, promotions) };
  });
  const plans = pricedPlans.map(({ plan, priced }) => ({
    id: plan.id,
    name: plan.name,
    months: plan.durationMonths,
    priceCents: priced.chargeCents,
    discountPercent: plan.discountPercent,
    chargeCents: priced.chargeCents,
    promotionPercent: priced.promotion?.discountPercent ?? 0,
  }));
  const banner = pricedPlans
    .map((item) => item.priced.promotion)
    .filter((promotion) => promotion != null)
    .sort((left, right) => right.discountPercent - left.discountPercent)[0];
  const profile = creator.user.profile;
  const monthly = plans.find((plan) => plan.months === 1) ?? plans[0];
  return {
    id: creator.id,
    name: profile?.name ?? "Creator",
    username: profile?.username ?? creator.id,
    bio: profile?.bio ?? "",
    city: profile?.city ?? "",
    avatarUrl: profile?.avatarUrl ?? "",
    coverUrl: profile?.coverUrl ?? "",
    category: creator.category,
    verified: true,
    isFree: (monthly?.chargeCents ?? 0) === 0,
    monthlyPriceCents: monthly?.chargeCents ?? 0,
    subscriberCount: 0,
    postCount: creator.posts.length,
    likeCount: creator.posts.reduce((total, post) => total + post.likeCount, 0),
    aiGenerated: creator.aiGenerated,
    fictitious: creator.fictitious,
    currency,
    plans,
    packs: creator.contentPacks.map((pack) => ({
      id: pack.id,
      name: pack.name,
      priceCents: centsForCurrency(currency, pack.priceCents, pack.priceCentsUsd),
    })),
    promotion: banner
      ? {
          name: banner.name,
          discountPercent: banner.discountPercent,
          spotsLeft: banner.subscriberCap == null ? null : Math.max(0, banner.subscriberCap - banner.redeemedCount),
        }
      : null,
  };
}
