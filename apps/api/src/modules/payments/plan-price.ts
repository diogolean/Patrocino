import { applyPromotion, planChargeCents, type PromotionRule } from "@mimelux/core/monetization";

export type PlanPriceInput = {
  id: string;
  priceCents: number;
  discountPercent: number;
};

export type PromotionInput = {
  planId: string | null;
  name: string;
  discountPercent: number;
  startsAt: Date;
  endsAt: Date;
  subscriberCap: number | null;
  redeemedCount: number;
  active: boolean;
};

function rule(row: PromotionInput): PromotionRule {
  return {
    discountPercent: row.discountPercent,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    ...(row.subscriberCap == null ? {} : { subscriberCap: row.subscriberCap }),
    redeemedCount: row.redeemedCount,
    active: row.active,
  };
}

/** Same cents checkout charges: plan price, bundle discount, then the best open promotion. */
export function chargeForPlan(plan: PlanPriceInput, promotions: PromotionInput[], now = new Date()) {
  const base = planChargeCents(plan);
  const applicable = promotions
    .filter((row) => row.planId == null || row.planId === plan.id)
    .map((row) => ({ row, priced: applyPromotion(base, rule(row), now) }))
    .filter((item) => item.priced.applied)
    .sort((left, right) => right.priced.discountPercent - left.priced.discountPercent);
  const best = applicable[0];
  if (!best) return { chargeCents: base, promotion: null as PromotionInput | null };
  return { chargeCents: best.priced.priceCents, promotion: best.row };
}
