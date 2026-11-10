export type MonetizationKind =
  | "subscription"
  | "ppv"
  | "pack"
  | "special_request";

export type PromotionRule = {
  discountPercent: number;
  startsAt: Date;
  endsAt: Date;
  subscriberCap?: number;
  redeemedCount: number;
  active: boolean;
};

export function calculateBundlePrice(
  monthlyPriceCents: number,
  months: number,
  discountPercent: number,
) {
  if (!Number.isInteger(monthlyPriceCents) || monthlyPriceCents < 0) {
    throw new Error("Monthly price must be a non-negative integer.");
  }
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new Error("Bundle duration must be between 1 and 24 months.");
  }
  if (discountPercent < 0 || discountPercent > 95) {
    throw new Error("Discount must be between 0 and 95 percent.");
  }
  return Math.round(monthlyPriceCents * months * (1 - discountPercent / 100));
}

export function applyPromotion(
  basePriceCents: number,
  promotion: PromotionRule | null,
  now = new Date(),
) {
  if (
    !promotion ||
    !promotion.active ||
    now < promotion.startsAt ||
    now > promotion.endsAt ||
    (promotion.subscriberCap !== undefined &&
      promotion.redeemedCount >= promotion.subscriberCap)
  ) {
    return {
      priceCents: basePriceCents,
      discountPercent: 0,
      applied: false,
    };
  }
  return {
    priceCents: Math.max(
      0,
      Math.round(basePriceCents * (1 - promotion.discountPercent / 100)),
    ),
    discountPercent: promotion.discountPercent,
    applied: true,
  };
}

export type CommissionConfig = {
  rateBps: number;
  subscription: boolean;
  ppv: boolean;
  pack: boolean;
  specialRequest: boolean;
};

export function calculateCommission(
  amountCents: number,
  kind: MonetizationKind,
  config: CommissionConfig,
) {
  const enabled =
    kind === "subscription"
      ? config.subscription
      : kind === "ppv"
        ? config.ppv
        : kind === "pack"
          ? config.pack
          : config.specialRequest;
  if (!enabled) return 0;
  if (config.rateBps < 0 || config.rateBps > 10_000) {
    throw new Error("Commission rate must be valid basis points.");
  }
  return Math.round((amountCents * config.rateBps) / 10_000);
}

export type LedgerDraft = {
  direction: "DEBIT" | "CREDIT";
  account: "platform_cash" | "creator_payable" | "affiliate_payable" | "platform_revenue";
  amountCents: number;
};

export type OwnershipType = "HOUSE" | "INDEPENDENT";

export type RevenueSplitInput = {
  grossCents: number;
  ownership: OwnershipType;
  creatorShareBps: number;
  affiliateCommissionBps: number;
  referred: boolean;
};

function assertBps(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${label} must be valid basis points.`);
  }
}

/**
 * HOUSE: the platform keeps the sale. An affiliate commission is deducted from that revenue.
 * INDEPENDENT: the creator keeps creatorShareBps and the platform keeps the rest.
 * An affiliate commission on an independent sale is deducted from the creator share.
 * Internal balances only; a later Stripe Connect transfer can pay creator_payable and affiliate_payable.
 */
export function splitRevenue(input: RevenueSplitInput): LedgerDraft[] {
  const { grossCents, ownership, referred } = input;
  if (!Number.isInteger(grossCents) || grossCents <= 0) {
    throw new Error("Gross must be a positive integer.");
  }
  assertBps(input.creatorShareBps, "Creator share");
  assertBps(input.affiliateCommissionBps, "Affiliate commission");

  let creator = 0;
  let affiliate = 0;
  if (ownership === "HOUSE") {
    affiliate = referred ? Math.round((grossCents * input.affiliateCommissionBps) / 10_000) : 0;
    if (affiliate > grossCents) affiliate = grossCents;
  } else {
    creator = Math.round((grossCents * input.creatorShareBps) / 10_000);
    affiliate = referred ? Math.round((grossCents * input.affiliateCommissionBps) / 10_000) : 0;
    if (affiliate > creator) affiliate = creator;
    creator -= affiliate;
  }
  const platform = grossCents - creator - affiliate;
  const entries: LedgerDraft[] = [
    { direction: "DEBIT", account: "platform_cash", amountCents: grossCents },
  ];
  if (creator > 0) entries.push({ direction: "CREDIT", account: "creator_payable", amountCents: creator });
  if (affiliate > 0) entries.push({ direction: "CREDIT", account: "affiliate_payable", amountCents: affiliate });
  if (platform > 0) entries.push({ direction: "CREDIT", account: "platform_revenue", amountCents: platform });
  return entries;
}

/**
 * Assignment wins, then the creator's own affiliate rate, then the affiliate's rate, then the platform default.
 * A null creator rate does not change affiliates who already settle at their own rate.
 */
export function resolveAffiliateRateBps(input: {
  assignmentBps?: number | null;
  creatorBps?: number | null;
  affiliateBps?: number | null;
  platformBps: number;
}) {
  const picked = [input.assignmentBps, input.creatorBps, input.affiliateBps, input.platformBps].find(
    (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000,
  );
  return picked ?? 0;
}

export function reverseLedger(entries: LedgerDraft[]): LedgerDraft[] {
  return entries.map((entry) => ({
    ...entry,
    direction: entry.direction === "DEBIT" ? "CREDIT" : "DEBIT",
  }));
}

export function planChargeCents(plan: { priceCents: number; discountPercent: number }) {
  const discount = Math.min(95, Math.max(0, plan.discountPercent));
  return Math.max(0, Math.round(plan.priceCents * (1 - discount / 100)));
}

export function subscriptionGrantsAccess(input: {
  status: string;
  currentPeriodEnd: Date | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!input.currentPeriodEnd || input.currentPeriodEnd.getTime() <= now.getTime()) return false;
  return input.status === "ACTIVE" || input.status === "PAST_DUE" || input.status === "CANCELED";
}

export function createDoubleEntryLedger(
  amountCents: number,
  affiliateCommissionCents: number,
): LedgerDraft[] {
  if (amountCents <= 0 || affiliateCommissionCents < 0) {
    throw new Error("Ledger amounts must be valid.");
  }
  if (affiliateCommissionCents > amountCents) {
    throw new Error("Commission cannot exceed payment.");
  }
  const entries: LedgerDraft[] = [
    { direction: "DEBIT", account: "platform_cash", amountCents },
    {
      direction: "CREDIT",
      account: "creator_payable",
      amountCents: amountCents - affiliateCommissionCents,
    },
  ];
  if (affiliateCommissionCents > 0) {
    entries.push({
      direction: "CREDIT",
      account: "affiliate_payable",
      amountCents: affiliateCommissionCents,
    });
  }
  return entries;
}

export function ledgerBalances(entries: LedgerDraft[]) {
  return entries.reduce(
    (sum, entry) =>
      sum + (entry.direction === "DEBIT" ? entry.amountCents : -entry.amountCents),
    0,
  );
}

export type SpecialRequestStatus =
  | "requested"
  | "quoted"
  | "accepted"
  | "paid"
  | "delivered"
  | "declined"
  | "refunded";

const specialRequestTransitions: Record<SpecialRequestStatus, SpecialRequestStatus[]> = {
  requested: ["quoted", "declined"],
  quoted: ["accepted", "declined"],
  accepted: ["paid", "declined"],
  paid: ["delivered", "refunded"],
  delivered: [],
  declined: [],
  refunded: [],
};

export function canTransitionSpecialRequest(
  from: SpecialRequestStatus,
  to: SpecialRequestStatus,
) {
  return specialRequestTransitions[from].includes(to);
}
