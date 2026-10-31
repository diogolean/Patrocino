export type ProfilePlan = {
  id: string;
  name: string;
  months: number;
  chargeCents: number;
  promotionPercent: number;
};

export type ProfilePack = {
  id: string;
  name: string;
  priceCents: number;
};

export type ProfilePromotion = {
  discountPercent: number;
  spotsLeft: number | null;
};

export type ProfileOffers = {
  source: "database";
  currency: "BRL" | "USD";
  plans: ProfilePlan[];
  packs: ProfilePack[];
  promotion: ProfilePromotion | null;
};

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function parseProfileOffers(payload: unknown): ProfileOffers | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { plans?: unknown; packs?: unknown; promotion?: unknown; currency?: unknown };
  if (!Array.isArray(body.plans)) return null;
  const plans: ProfilePlan[] = [];
  for (const item of body.plans) {
    if (!item || typeof item !== "object") continue;
    const plan = item as { id?: unknown; name?: unknown; months?: unknown; chargeCents?: unknown; promotionPercent?: unknown };
    const months = numberOrNull(plan.months);
    const chargeCents = numberOrNull(plan.chargeCents);
    if (typeof plan.id !== "string" || typeof plan.name !== "string" || months == null || chargeCents == null) continue;
    plans.push({
      id: plan.id,
      name: plan.name,
      months,
      chargeCents,
      promotionPercent: numberOrNull(plan.promotionPercent) ?? 0,
    });
  }
  const packs: ProfilePack[] = [];
  if (Array.isArray(body.packs)) {
    for (const item of body.packs) {
      if (!item || typeof item !== "object") continue;
      const pack = item as { id?: unknown; name?: unknown; priceCents?: unknown };
      const priceCents = numberOrNull(pack.priceCents);
      if (typeof pack.id !== "string" || typeof pack.name !== "string" || priceCents == null) continue;
      packs.push({ id: pack.id, name: pack.name, priceCents });
    }
  }
  let promotion: ProfilePromotion | null = null;
  if (body.promotion && typeof body.promotion === "object") {
    const row = body.promotion as { discountPercent?: unknown; spotsLeft?: unknown };
    const discountPercent = numberOrNull(row.discountPercent);
    if (discountPercent != null && discountPercent > 0) {
      promotion = {
        discountPercent,
        spotsLeft: numberOrNull(row.spotsLeft),
      };
    }
  }
  const currency = body.currency === "USD" ? "USD" : "BRL";
  return { source: "database", currency, plans, packs, promotion };
}
