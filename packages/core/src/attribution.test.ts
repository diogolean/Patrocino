import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  attributionFromSearch,
  attributionHeaderValue,
  browserMetaCommand,
  firstTouch,
  fbcFromFbclid,
  landingAttribution,
  parseAttribution,
  preserveAttributionSearch,
  purchaseColumns,
  purchaseTouchFromHeaders,
  readMetaPixelId,
  sanitizeUtm,
  serializeAttribution,
  touchFromCookieHeader,
  utmColumns,
} from "./attribution";

describe("utm capture", () => {
  it("keeps the first landing and builds fbc from fbclid", () => {
    const incoming = attributionFromSearch(
      new URLSearchParams("utm_source=instagram&utm_medium=paid&utm_campaign=marco&utm_content=bio&utm_term=patrocinio&fbclid=IwAR123"),
      1_700_000_000_000,
    );
    expect(incoming).toEqual({
      source: "instagram",
      medium: "paid",
      campaign: "marco",
      content: "bio",
      term: "patrocinio",
      fbc: "fb.1.1700000000000.IwAR123",
    });
    expect(fbcFromFbclid("IwAR123", 10)).toBe("fb.1.10.IwAR123");
    const again = attributionFromSearch(new URLSearchParams("utm_source=google&fbclid=OTHER"));
    expect(firstTouch(incoming, again)).toEqual(incoming);
    const encoded = serializeAttribution(incoming!);
    expect(parseAttribution(encoded)).toEqual(incoming);
    expect(touchFromCookieHeader(`${ATTRIBUTION_COOKIE}=${encodeURIComponent(encoded)}; other=1`)).toEqual(incoming);
  });

  it("drops email-shaped values and cuts long tokens", () => {
    expect(sanitizeUtm("fan@patrocino.com")).toBeUndefined();
    expect(sanitizeUtm(`  ${"a".repeat(200)}  `)).toHaveLength(120);
    expect(attributionFromSearch(new URLSearchParams("utm_source=fan@patrocino.com&utm_medium=cpc"))).toEqual({ medium: "cpc" });
    expect(attributionFromSearch(new URLSearchParams("utm_source=%00%0A"))).toBeNull();
    expect(attributionFromSearch(new URLSearchParams("fbclid=has space"))).toBeNull();
  });

  it("preserves utm and fbclid across a redirect without replacing an existing cookie", () => {
    const search = new URLSearchParams("utm_source=ig&utm_campaign=launch&fbclid=CLICKID&email=fan@patrocino.com");
    const fresh = landingAttribution({
      location: "/creator/luna?ref=ezequiel",
      search,
      cookieHeader: "",
      secure: true,
      now: 50,
    });
    expect(fresh.location).toBe("/creator/luna?ref=ezequiel&utm_source=ig&utm_campaign=launch&fbclid=CLICKID");
    expect(fresh.location).not.toContain("fan@");
    expect(fresh.cookie?.name).toBe(ATTRIBUTION_COOKIE);
    expect(fresh.cookie?.options.maxAge).toBe(ATTRIBUTION_MAX_AGE_SECONDS);
    expect(fresh.cookie?.options.httpOnly).toBe(false);
    expect(parseAttribution(fresh.cookie?.value)).toMatchObject({ source: "ig", campaign: "launch", fbc: "fb.1.50.CLICKID" });

    const kept = landingAttribution({
      location: "/creator/luna",
      search,
      cookieHeader: `${ATTRIBUTION_COOKIE}=${fresh.cookie?.value}`,
      secure: false,
      now: 99,
    });
    expect(preserveAttributionSearch("/checkout?kind=pack", search)).toContain("utm_source=ig");
    expect(kept.cookie).toBeNull();
    expect(parseAttribution(fresh.cookie?.value)?.fbc).toContain("CLICKID");
  });

  it("stores columns for the user and the purchase, and forwards only safe headers", () => {
    const touch = attributionFromSearch(new URLSearchParams("utm_source=ig&fbclid=CLICKID"), 7)!;
    expect(utmColumns(touch)).toEqual({ utmSource: "ig" });
    const purchase = purchaseTouchFromHeaders({
      attribution: attributionHeaderValue(touch),
      fbp: "fb.1.7.123.abc",
      userAgent: "Mozilla/5.0",
      clientIp: "203.0.113.8",
    });
    expect(purchaseColumns(purchase)).toEqual({
      utmSource: "ig",
      fbc: "fb.1.7.CLICKID",
      fbp: "fb.1.7.123.abc",
      clientUserAgent: "Mozilla/5.0",
      clientIp: "203.0.113.8",
    });
    expect(purchaseTouchFromHeaders({ attribution: "nope", fbp: "not-a-cookie", clientIp: "unknown", userAgent: "" })).toBeNull();
    expect(purchaseColumns(purchase)).not.toHaveProperty("email");
  });
});

describe("browser pixel payloads", () => {
  it("builds the five events without personal data and shares event id", () => {
    expect(readMetaPixelId("")).toBe("");
    expect(readMetaPixelId("G-DKVQZBEHY6")).toBe("");
    expect(readMetaPixelId("123456789012345")).toBe("123456789012345");
    const view = browserMetaCommand("ViewContent", { content_ids: ["luna"], content_type: "product", email: "fan@patrocino.com" });
    expect(view).toEqual(["track", "ViewContent", { content_ids: ["luna"], content_type: "product" }]);
    const purchase = browserMetaCommand("Purchase", { value: 19.9, currency: "BRL", content_ids: ["luna"], content_type: "product" }, "pur_1");
    const subscribe = browserMetaCommand("Subscribe", { value: 19.9, currency: "USD", content_ids: ["luna"], content_type: "product" }, "pur_1");
    expect(purchase[3]).toEqual({ eventID: "pur_1" });
    expect(subscribe[3]).toEqual({ eventID: "pur_1" });
    expect(JSON.stringify([purchase, subscribe])).not.toContain("@");
    expect(browserMetaCommand("PageView", {})[1]).toBe("PageView");
    expect(browserMetaCommand("CompleteRegistration", { status: "completed" })[1]).toBe("CompleteRegistration");
    expect(browserMetaCommand("InitiateCheckout", { value: 49, currency: "BRL" })[2]).toMatchObject({ value: 49, currency: "BRL" });
  });
});
