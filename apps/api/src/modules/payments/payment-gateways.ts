import Stripe from "stripe";

type Env = Record<string, string | undefined>;

function usable(value: string | undefined) {
  const key = value?.trim() ?? "";
  if (!key || key.includes("replace_me")) return "";
  return key;
}

export function readStripeSecret(env: Env = process.env) {
  const key = usable(env.STRIPE_SECRET_KEY);
  if (!key) return { ok: false as const, reason: "missing" };
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (live && env.STRIPE_ALLOW_LIVE !== "true") return { ok: false as const, reason: "live_disabled" };
  if (!live && !key.startsWith("sk_test_")) return { ok: false as const, reason: "invalid" };
  return { ok: true as const, key, live };
}

export function readStripePublishable(env: Env = process.env) {
  const key = usable(env.STRIPE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  if (!key) return { ok: false as const, reason: "missing" };
  const live = key.startsWith("pk_live_");
  if (live && env.STRIPE_ALLOW_LIVE !== "true") return { ok: false as const, reason: "live_disabled" };
  if (!live && !key.startsWith("pk_test_")) return { ok: false as const, reason: "invalid" };
  return { ok: true as const, key, live };
}

export function readStripeWebhookSecret(env: Env = process.env) {
  const key = usable(env.STRIPE_WEBHOOK_SECRET);
  if (!key) return { ok: false as const, reason: "missing" };
  return { ok: true as const, key };
}

export type PaymentCheckout = {
  purchaseId: string;
  amountCents: number;
  currency: "brl" | "usd";
  description: string;
  buyerId?: string;
  creatorId?: string;
  purpose?: string;
  subjectId?: string;
};

export interface PaymentProviderGateway {
  createCheckout(input: PaymentCheckout): Promise<{
    provider: "stripe" | "pix" | "crypto";
    externalId: string;
    clientSecret?: string | null;
    simulated: boolean;
  }>;
}

export class StripeTestGateway implements PaymentProviderGateway {
  async createCheckout(input: PaymentCheckout) {
    const key = readStripeSecret();
    if (!key.ok) {
      throw new Error(`Stripe is not configured (${key.reason})`);
    }
    const stripe = new Stripe(key.key);
    const intent = await stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: input.currency,
        description: input.description,
        metadata: {
          purchaseId: input.purchaseId,
          ...(input.buyerId ? { userId: input.buyerId } : {}),
          ...(input.creatorId ? { creatorId: input.creatorId } : {}),
          ...(input.purpose ? { purpose: input.purpose } : {}),
          ...(input.subjectId ? { subjectId: input.subjectId } : {}),
        },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: input.purchaseId },
    );
    return {
      provider: "stripe" as const,
      externalId: intent.id,
      clientSecret: intent.client_secret,
      simulated: false,
    };
  }
}

export class StubPaymentGateway implements PaymentProviderGateway {
  constructor(private readonly provider: "pix" | "crypto") {}

  async createCheckout(input: PaymentCheckout) {
    return {
      provider: this.provider,
      externalId: `${this.provider}_demo_${input.purchaseId}`,
      simulated: true,
    };
  }
}

export function paymentProvider(provider: "stripe" | "pix" | "crypto") {
  return provider === "stripe"
    ? new StripeTestGateway()
    : new StubPaymentGateway(provider);
}
