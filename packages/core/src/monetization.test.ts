import { describe, expect, it } from "vitest";
import {
  applyPromotion,
  calculateBundlePrice,
  calculateCommission,
  canTransitionSpecialRequest,
  createDoubleEntryLedger,
  ledgerBalances,
  resolveAffiliateRateBps,
  reverseLedger,
  splitRevenue,
  subscriptionGrantsAccess,
} from "./monetization";

const commissionConfig = {
  rateBps: 2_000,
  subscription: true,
  ppv: true,
  pack: true,
  specialRequest: true,
};

describe("monetization rules", () => {
  it("prices subscription bundles with a discount", () => {
    expect(calculateBundlePrice(3_000, 6, 20)).toBe(14_400);
  });

  it("applies only active, available promotions", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    const active = {
      discountPercent: 50,
      startsAt: new Date("2026-10-16"),
      endsAt: new Date("2026-10-20"),
      subscriberCap: 10,
      redeemedCount: 3,
      active: true,
    };
    expect(applyPromotion(3_000, active, now)).toEqual({
      priceCents: 1_500,
      discountPercent: 50,
      applied: true,
    });
    expect(
      applyPromotion(3_000, { ...active, redeemedCount: 10 }, now).applied,
    ).toBe(false);
    expect(
      applyPromotion(
        3_000,
        { ...active, endsAt: new Date("2026-10-16") },
        now,
      ).applied,
    ).toBe(false);
  });

  it.each(["subscription", "ppv", "pack", "special_request"] as const)(
    "calculates affiliate commission for %s",
    (kind) => {
      expect(calculateCommission(10_000, kind, commissionConfig)).toBe(2_000);
    },
  );

  it("creates a balanced double-entry ledger", () => {
    const entries = createDoubleEntryLedger(10_000, 2_000);
    expect(ledgerBalances(entries)).toBe(0);
    expect(entries).toHaveLength(3);
  });

  it("splits a house direct sale entirely to the platform", () => {
    const entries = splitRevenue({
      grossCents: 10_000,
      ownership: "HOUSE",
      creatorShareBps: 8_000,
      affiliateCommissionBps: 2_000,
      referred: false,
    });
    expect(ledgerBalances(entries)).toBe(0);
    expect(entries).toEqual([
      { direction: "DEBIT", account: "platform_cash", amountCents: 10_000 },
      { direction: "CREDIT", account: "platform_revenue", amountCents: 10_000 },
    ]);
  });

  it("splits a house referred sale by deducting the affiliate from the platform", () => {
    const entries = splitRevenue({
      grossCents: 10_000,
      ownership: "HOUSE",
      creatorShareBps: 8_000,
      affiliateCommissionBps: 2_000,
      referred: true,
    });
    expect(ledgerBalances(entries)).toBe(0);
    expect(entries).toEqual([
      { direction: "DEBIT", account: "platform_cash", amountCents: 10_000 },
      { direction: "CREDIT", account: "affiliate_payable", amountCents: 2_000 },
      { direction: "CREDIT", account: "platform_revenue", amountCents: 8_000 },
    ]);
  });

  it("splits an independent direct sale with the default creator share", () => {
    const entries = splitRevenue({
      grossCents: 10_000,
      ownership: "INDEPENDENT",
      creatorShareBps: 8_000,
      affiliateCommissionBps: 2_000,
      referred: false,
    });
    expect(ledgerBalances(entries)).toBe(0);
    expect(entries).toEqual([
      { direction: "DEBIT", account: "platform_cash", amountCents: 10_000 },
      { direction: "CREDIT", account: "creator_payable", amountCents: 8_000 },
      { direction: "CREDIT", account: "platform_revenue", amountCents: 2_000 },
    ]);
  });

  it("splits an independent referred sale by deducting the affiliate from the creator", () => {
    const entries = splitRevenue({
      grossCents: 10_000,
      ownership: "INDEPENDENT",
      creatorShareBps: 8_000,
      affiliateCommissionBps: 2_000,
      referred: true,
    });
    expect(ledgerBalances(entries)).toBe(0);
    expect(entries).toEqual([
      { direction: "DEBIT", account: "platform_cash", amountCents: 10_000 },
      { direction: "CREDIT", account: "creator_payable", amountCents: 6_000 },
      { direction: "CREDIT", account: "affiliate_payable", amountCents: 2_000 },
      { direction: "CREDIT", account: "platform_revenue", amountCents: 2_000 },
    ]);
    expect(ledgerBalances(reverseLedger(entries))).toBe(0);
  });

  it("clamps an independent affiliate commission that would exceed the creator share", () => {
    const entries = splitRevenue({
      grossCents: 10_000,
      ownership: "INDEPENDENT",
      creatorShareBps: 3_000,
      affiliateCommissionBps: 5_000,
      referred: true,
    });
    expect(ledgerBalances(entries)).toBe(0);
    expect(entries.find((entry) => entry.account === "affiliate_payable")?.amountCents).toBe(3_000);
    expect(entries.find((entry) => entry.account === "creator_payable")).toBeUndefined();
  });

  it("lets a creator rate override the affiliate rate unless an assignment is set", () => {
    expect(resolveAffiliateRateBps({ creatorBps: null, affiliateBps: 2_000, platformBps: 2_000 })).toBe(2_000);
    expect(resolveAffiliateRateBps({ creatorBps: 5_000, affiliateBps: 2_000, platformBps: 2_000 })).toBe(5_000);
    expect(resolveAffiliateRateBps({ assignmentBps: 1_000, creatorBps: 5_000, affiliateBps: 2_000, platformBps: 2_000 })).toBe(1_000);
    expect(resolveAffiliateRateBps({ platformBps: 2_000 })).toBe(2_000);
  });

  it("grants access only through the paid period", () => {
    const future = new Date("2026-12-01T00:00:00Z");
    const past = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-10-21T00:00:00Z");
    expect(subscriptionGrantsAccess({ status: "ACTIVE", currentPeriodEnd: future, now })).toBe(true);
    expect(subscriptionGrantsAccess({ status: "CANCELED", currentPeriodEnd: future, now })).toBe(true);
    expect(subscriptionGrantsAccess({ status: "ACTIVE", currentPeriodEnd: past, now })).toBe(false);
    expect(subscriptionGrantsAccess({ status: "PENDING", currentPeriodEnd: future, now })).toBe(false);
    expect(subscriptionGrantsAccess({ status: "EXPIRED", currentPeriodEnd: future, now })).toBe(false);
  });

  it("enforces the special request lifecycle", () => {
    expect(canTransitionSpecialRequest("requested", "quoted")).toBe(true);
    expect(canTransitionSpecialRequest("quoted", "delivered")).toBe(false);
    expect(canTransitionSpecialRequest("paid", "delivered")).toBe(true);
  });
});
