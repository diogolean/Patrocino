/**
 * Stripe key policy for Patrocino.
 *
 * sk_test_ works while STRIPE_ALLOW_LIVE is not true.
 * Live charges accept rk_live_ (restricted) or sk_live_ only when
 * STRIPE_ALLOW_LIVE=true. The webhook still verifies Stripe-Signature
 * locally with STRIPE_WEBHOOK_SECRET; that check does not call the API.
 */

export function paymentMethodsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return {
    expay: env.PAYMENTS_EXPAY_ENABLED === "true",
    stripe: env.PAYMENTS_STRIPE_ENABLED === "true",
  };
}

export function resolveStripeSecretKey(env: NodeJS.ProcessEnv = process.env) {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const allowLive = env.STRIPE_ALLOW_LIVE === "true";
  if (key.startsWith("sk_test_")) return { key, livemode: false as const };
  if (allowLive && (key.startsWith("rk_live_") || key.startsWith("sk_live_"))) {
    return { key, livemode: true as const };
  }
  if (!key) throw new Error("Stripe secret key is not configured.");
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
    throw new Error("Stripe live mode is off. Set STRIPE_ALLOW_LIVE=true to use an rk_live_ key.");
  }
  throw new Error("Stripe requires an sk_test_ key, or an rk_live_ key when STRIPE_ALLOW_LIVE=true.");
}

/** Publishable keys only. A pk_live_ key is returned only when live mode is on. */
export function stripePublishableKey(env: NodeJS.ProcessEnv = process.env) {
  const key = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  if (key.startsWith("pk_test_")) return key;
  if (env.STRIPE_ALLOW_LIVE === "true" && key.startsWith("pk_live_")) return key;
  return null;
}
