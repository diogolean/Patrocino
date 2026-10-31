import { describe, expect, it } from "vitest";
import { monthlyCents, providerOf, rate, startOfSaoPauloDay, sumByCurrency } from "../../apps/api/src/modules/admin/overview-math";

describe("executive overview math", () => {
  it("starts 'today' at midnight in São Paulo", () => {
    expect(startOfSaoPauloDay(new Date("2026-10-31T02:30:00Z")).toISOString()).toBe("2026-10-30T03:00:00.000Z");
    expect(startOfSaoPauloDay(new Date("2026-10-31T18:59:00Z")).toISOString()).toBe("2026-10-31T03:00:00.000Z");
  });

  it("keeps BRL and USD apart and never mixes currencies", () => {
    expect(sumByCurrency([{ currency: "BRL", amountCents: 100 }, { currency: "usd", amountCents: 4900 }, { currency: "BRL", amountCents: 14900 }])).toEqual({ BRL: 15000, USD: 4900 });
  });

  it("normalizes multi-month plans to monthly revenue in the subscription currency", () => {
    const plan = { priceCents: 32760, priceCentsUsd: 6720, durationMonths: 12 };
    expect(monthlyCents(plan, "BRL")).toBe(2730);
    expect(monthlyCents(plan, "USD")).toBe(560);
  });

  it("labels providers and rates", () => {
    expect(providerOf("pi_123")).toBe("stripe");
    expect(providerOf("cs_live_x")).toBe("stripe");
    expect(providerOf("ch-9f2")).toBe("pix");
    expect(providerOf(null)).toBe("other");
    expect(rate(1, 4)).toBe(25);
    expect(rate(3, 0)).toBe(0);
  });
});
