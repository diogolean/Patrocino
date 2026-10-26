import { describe, expect, it } from "vitest";
import { paymentMethodsEnabled, resolveStripeSecretKey, stripePublishableKey } from "./stripe";

describe("Stripe keys", () => {
  it("keeps test keys working while live mode is off", () => {
    expect(resolveStripeSecretKey({ STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_ALLOW_LIVE: "false" })).toEqual({
      key: "sk_test_abc",
      livemode: false,
    });
    expect(() => resolveStripeSecretKey({ STRIPE_SECRET_KEY: "rk_live_abc", STRIPE_ALLOW_LIVE: "false" })).toThrow(
      /STRIPE_ALLOW_LIVE=true/,
    );
    expect(() => resolveStripeSecretKey({ STRIPE_SECRET_KEY: "sk_live_abc" })).toThrow(/STRIPE_ALLOW_LIVE=true/);
  });

  it("accepts a restricted live key only when live mode is on", () => {
    expect(resolveStripeSecretKey({ STRIPE_SECRET_KEY: " rk_live_restricted ", STRIPE_ALLOW_LIVE: "true" })).toEqual({
      key: "rk_live_restricted",
      livemode: true,
    });
    expect(resolveStripeSecretKey({ STRIPE_SECRET_KEY: "sk_live_full", STRIPE_ALLOW_LIVE: "true" })).toEqual({
      key: "sk_live_full",
      livemode: true,
    });
    expect(resolveStripeSecretKey({ STRIPE_SECRET_KEY: "sk_test_still", STRIPE_ALLOW_LIVE: "true" }).livemode).toBe(false);
    expect(() => resolveStripeSecretKey({ STRIPE_SECRET_KEY: "rk_test_nope", STRIPE_ALLOW_LIVE: "true" })).toThrow(
      /sk_test_/,
    );
    expect(() => resolveStripeSecretKey({ STRIPE_SECRET_KEY: "" })).toThrow(/not configured/);
  });

  it("toggles Pix and card independently and hides a live publishable key until live mode is on", () => {
    expect(paymentMethodsEnabled({})).toEqual({ expay: false, stripe: false });
    expect(paymentMethodsEnabled({ PAYMENTS_EXPAY_ENABLED: "true", PAYMENTS_STRIPE_ENABLED: "true" })).toEqual({
      expay: true,
      stripe: true,
    });
    expect(stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc" })).toBe("pk_test_abc");
    expect(
      stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_abc", STRIPE_ALLOW_LIVE: "false" }),
    ).toBeNull();
    expect(
      stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_abc", STRIPE_ALLOW_LIVE: "true" }),
    ).toBe("pk_live_abc");
    expect(stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "rk_live_secret" })).toBeNull();
  });
});
