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

import { bucketStarts, percentDelta, resolveRange } from "../../apps/api/src/modules/admin/overview-range";

describe("executive overview range", () => {
  const now = new Date("2026-10-31T19:00:00Z"); // 16:00 in São Paulo

  it("resolves presets in São Paulo time with an equally long previous window", () => {
    const today = resolveRange({ range: "today" }, now);
    expect(today.from.toISOString()).toBe("2026-10-31T03:00:00.000Z");
    expect(today.prevFrom.toISOString()).toBe("2026-10-30T11:00:00.000Z");
    expect(today.bucket).toBe("hour");
    expect(resolveRange({ range: "month" }, now).from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(resolveRange({ range: "7d" }, now).from.toISOString()).toBe("2026-10-25T03:00:00.000Z");
    expect(resolveRange({ range: "bogus" }, now).preset).toBe("30d");
  });

  it("makes custom ranges inclusive, ordered and capped at now", () => {
    const custom = resolveRange({ range: "custom", from: "2026-10-31", to: "2026-10-01" }, now);
    expect(custom.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(custom.to.toISOString()).toBe(now.toISOString());
    expect(bucketStarts(custom)).toHaveLength(31);
    expect(resolveRange({ range: "custom", from: "x", to: "2026-10-10" }, now).to.toISOString()).toBe("2026-10-11T03:00:00.000Z");
  });

  it("computes deltas without dividing by zero", () => {
    expect(percentDelta(150, 100)).toBe(50);
    expect(percentDelta(5, 0)).toBeNull();
    expect(percentDelta(0, 0)).toBe(0);
  });
});

import { areaPath, linePath, scalePoints } from "../../apps/web/components/admin-overview/chart-geometry";

describe("overview chart geometry", () => {
  it("maps values onto the SVG box and closes the area at the bottom", () => {
    const points = scalePoints([0, 50, 100], 200, 100, 100, 0);
    expect(points).toEqual([[0, 100], [100, 50], [200, 0]]);
    expect(linePath(points)).toBe("M0.0,100.0 L100.0,50.0 L200.0,0.0");
    expect(areaPath(points, 100)).toMatch(/L200.0,100 L0.0,100 Z$/);
    expect(scalePoints([0, 0], 10, 10, 0, 0)).toEqual([[0, 10], [10, 10]]);
  });
});
