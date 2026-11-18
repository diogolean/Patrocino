import { describe, expect, it } from "vitest";
import { capiPayload, deliverCapiPurchase, hashNormalizedEmail, readMetaCapiConfig } from "./meta-capi";

const purchase = {
  eventId: "pur_1",
  eventTime: 1_700_000_000,
  eventSourceUrl: "https://patrocino.com/checkout",
  email: "  Fan@Patrocino.com ",
  amountCents: 1990,
  currency: "BRL",
  kind: "SUBSCRIPTION",
  contentId: "luna",
  clientIp: "203.0.113.8",
  clientUserAgent: "Mozilla/5.0",
  fbp: "fb.1.1.1.abc",
  fbc: "fb.1.1.CLICKID",
};

describe("meta conversions api", () => {
  it("hashes the normalized email and omits the raw address", () => {
    const hash = hashNormalizedEmail("  Fan@Patrocino.com ");
    expect(hash).toBe(hashNormalizedEmail("fan@patrocino.com"));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const body = capiPayload(purchase, "TEST123");
    const encoded = JSON.stringify(body);
    expect(encoded).not.toContain("Fan@");
    expect(encoded).not.toContain("fan@patrocino.com");
    expect(body?.data).toHaveLength(2);
    expect(body?.data.map((event) => event.event_name)).toEqual(["Purchase", "Subscribe"]);
    expect(body?.data[0]).toMatchObject({
      event_id: "pur_1",
      user_data: { em: [hash], client_ip_address: "203.0.113.8", client_user_agent: "Mozilla/5.0", fbp: "fb.1.1.1.abc", fbc: "fb.1.1.CLICKID" },
      custom_data: { value: 19.9, currency: "BRL", content_ids: ["luna"], content_type: "product" },
    });
    expect(body?.data[1]?.event_id).toBe("pur_1");
    expect(capiPayload({ ...purchase, kind: "POST", currency: "USD" })?.data.map((event) => event.event_name)).toEqual(["Purchase"]);
    expect(capiPayload({ ...purchase, kind: "POST", currency: "USD" })?.data[0]?.custom_data.currency).toBe("USD");
  });

  it("is a no-op without both server env values and sends a purchase only once", async () => {
    expect(readMetaCapiConfig({})).toBeNull();
    expect(readMetaCapiConfig({ META_PIXEL_ID: "12345", META_CAPI_ACCESS_TOKEN: "" })).toBeNull();
    expect(readMetaCapiConfig({ META_PIXEL_ID: "not-a-pixel", META_CAPI_ACCESS_TOKEN: "long-enough-token" })).toBeNull();
    const config = readMetaCapiConfig({
      META_PIXEL_ID: "1234567890",
      META_CAPI_ACCESS_TOKEN: "long-enough-token",
      META_CAPI_TEST_EVENT_CODE: "TEST1",
    });
    let claims = 0;
    let sends = 0;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      sends += 1;
      const href = String(url);
      expect(href).toContain("/1234567890/events");
      expect(href).toContain("access_token=long-enough-token");
      const body = JSON.parse(String(init?.body));
      expect(body.test_event_code).toBe("TEST1");
      expect(JSON.stringify(body)).not.toContain("fan@patrocino.com");
      expect(body.data[0].event_id).toBe("pur_1");
      return new Response("{}", { status: 200 });
    };
    const claim = async () => {
      claims += 1;
      return claims === 1;
    };
    expect(await deliverCapiPurchase({ config: null, purchase, claim, fetchImpl })).toBe("noop");
    expect(claims).toBe(0);
    expect(sends).toBe(0);
    expect(await deliverCapiPurchase({ config, purchase, claim, fetchImpl })).toBe("sent");
    expect(await deliverCapiPurchase({ config, purchase, claim, fetchImpl })).toBe("skip");
    expect(sends).toBe(1);
    expect(claims).toBe(2);
  });

  it("does not claim a purchase when the email cannot be hashed", async () => {
    let claims = 0;
    const result = await deliverCapiPurchase({
      config: { pixelId: "1234567890", accessToken: "long-enough-token" },
      purchase: { ...purchase, email: "not-an-email" },
      claim: async () => {
        claims += 1;
        return true;
      },
      fetchImpl: async () => new Response("{}", { status: 200 }),
    });
    expect(result).toBe("skip");
    expect(claims).toBe(0);
  });
});
