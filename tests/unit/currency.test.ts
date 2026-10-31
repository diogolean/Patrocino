import { describe, expect, it } from "vitest";
import {
  AFFILIATE_WINDOW_SECONDS,
  affiliateCookieValue,
  conversionRate,
  currencyForVisitor,
  formatMoney,
  monthlyPriceAllowed,
  parseAffiliateCookie,
  presentCommissionStatus,
  progressionSeries,
  readAffiliateCookieHeader,
  ppvQuote,
  videoPriceAllowed,
} from "../../packages/core/src/currency";

describe("visitor currency", () => {
  it("uses BRL for Brazil and for a pt-BR locale when the country is unknown", () => {
    expect(currencyForVisitor({ country: "BR", locale: "en" })).toBe("BRL");
    expect(currencyForVisitor({ country: "br" })).toBe("BRL");
    expect(currencyForVisitor({ locale: "pt-BR" })).toBe("BRL");
    expect(currencyForVisitor({ acceptLanguage: "pt-BR,en;q=0.8" })).toBe("BRL");
    expect(currencyForVisitor({})).toBe("BRL");
  });

  it("uses USD for every other country and hides the Brazil fallback", () => {
    expect(currencyForVisitor({ country: "US", locale: "pt-BR" })).toBe("USD");
    expect(currencyForVisitor({ country: "DE" })).toBe("USD");
    expect(currencyForVisitor({ locale: "en" })).toBe("USD");
    expect(currencyForVisitor({ acceptLanguage: "es-MX,pt-BR;q=0.2" })).toBe("USD");
  });

  it("formats money with Intl for the visitor locale", () => {
    expect(formatMoney(800, "USD", "en")).toMatch(/\$8\.00/);
    expect(formatMoney(3900, "BRL", "pt-BR")).toMatch(/39,00/);
    expect(formatMoney(4900, "BRL", "de")).toContain("49");
  });

  it("charges subscribers the lower video price and everyone else a little more", () => {
    const shared = {
      subscriberBrl: 4900,
      subscriberUsd: 1900,
      guestBrl: 5900,
      guestUsd: 2400,
    };
    expect(ppvQuote({ currency: "BRL", subscribed: true, ...shared }).amountCents).toBe(4900);
    expect(ppvQuote({ currency: "USD", subscribed: true, ...shared }).amountCents).toBe(1900);
    expect(ppvQuote({ currency: "BRL", subscribed: false, ...shared })).toMatchObject({ amountCents: 5900, subscriberCents: 4900 });
    expect(ppvQuote({ currency: "USD", subscribed: false, ...shared }).amountCents).toBe(2400);
    expect(ppvQuote({ currency: "BRL", subscribed: false, subscriberBrl: 100, subscriberUsd: 100 }).amountCents).toBe(100);
  });

  it("keeps catalog ranges on whole currency units", () => {
    expect(monthlyPriceAllowed("USD", 800)).toBe(true);
    expect(monthlyPriceAllowed("USD", 799)).toBe(false);
    expect(monthlyPriceAllowed("USD", 1000)).toBe(false);
    expect(monthlyPriceAllowed("BRL", 2900)).toBe(true);
    expect(monthlyPriceAllowed("BRL", 4000)).toBe(false);
    expect(videoPriceAllowed("USD", 1900)).toBe(true);
    expect(videoPriceAllowed("USD", 1699)).toBe(false);
    expect(videoPriceAllowed("BRL", 4900)).toBe(true);
  });

  it("labels a commission pending, confirmed, paid, or reversed", () => {
    const later = new Date("2026-11-10T00:00:00.000Z");
    const now = new Date("2026-10-31T00:00:00.000Z");
    expect(presentCommissionStatus("PENDING", later, now)).toBe("pending");
    expect(presentCommissionStatus("PENDING", now, later)).toBe("confirmed");
    expect(presentCommissionStatus("APPROVED", later, now)).toBe("confirmed");
    expect(presentCommissionStatus("PAID", later, now)).toBe("paid");
    expect(presentCommissionStatus("REJECTED", later, now)).toBe("reversed");
  });

  it("builds a daily progression of clicks, conversions, and earnings", () => {
    const now = new Date("2026-10-31T12:00:00.000Z");
    const series = progressionSeries({
      clicks: [now],
      conversions: [now],
      earnings: [{ at: now, amountCents: 2000 }],
    }, "day", now, 3);
    expect(series).toHaveLength(3);
    expect(series[2]).toMatchObject({ label: "2026-10-31", clicks: 1, conversions: 1, earningsCents: 2000 });
    expect(conversionRate(4, 1)).toBe(0.25);
    expect(conversionRate(0, 1)).toBe(0);
  });

  it("stores a 30-day last-click cookie", () => {
    expect(AFFILIATE_WINDOW_SECONDS).toBe(30 * 24 * 60 * 60);
    const raw = affiliateCookieValue({ code: "ezequiel", clickId: "clk_1", creatorUsername: "lunaferraz", subId: "ig" });
    const cookie = parseAffiliateCookie(raw);
    expect(cookie).toMatchObject({ code: "ezequiel", clickId: "clk_1", slug: "lunaferraz", subId: "ig" });
    expect(readAffiliateCookieHeader(`other=1; mimelux_attr=${encodeURIComponent(raw)}`)?.clickId).toBe("clk_1");
  });
});
