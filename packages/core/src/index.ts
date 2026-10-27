import { z } from "zod";

export * from "./assets";
export * from "./chat-sequence";
export * from "./contracts";
export * from "./demo-extra-posts";
export * from "./initial-creators";
export * from "./legal";
export * from "./monetization";

export const contentModes = ["general", "adult", "hybrid"] as const;
export type ContentMode = (typeof contentModes)[number];

export const contentMode: ContentMode = (() => {
  const value =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_CONTENT_MODE
      : undefined;
  return contentModes.includes(value as ContentMode)
    ? (value as ContentMode)
    : "hybrid";
})();

export const loginSchema = z.object({
  identifier: z.string().min(3).max(120),
  password: z.string().min(6).max(120),
});

export const accountRoles = ["fan", "creator", "affiliate"] as const;
export type AccountRole = (typeof accountRoles)[number];
export type SessionRole = AccountRole | "admin";

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.email(),
  password: z.string().min(6).max(120),
  role: z.enum(accountRoles),
});

export const checkoutSchema = z.object({
  kind: z.enum(["subscription", "post", "message", "pack", "special_request"]),
  itemId: z.string().min(1),
  amountCents: z.coerce.number().int().positive(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type TokenPair = {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
};

export const DEMO_ACCOUNTS = {
  fan: {
    email: "fan@mimelux.com.br",
    aliases: ["fan@patrocino.com", "fan@fanmimo.com", "fan@fanmimo.com.br"],
    password: "mimelux123",
  },
  creator: {
    email: "criadora@mimelux.com.br",
    alias: "creator@mimelux.com.br",
    aliases: [
      "creator@patrocino.com",
      "criadora@patrocino.com",
      "creator@fanmimo.com",
      "creator@fanmimo.com.br",
      "criadora@fanmimo.com",
      "criadora@fanmimo.com.br",
    ],
    password: "mimelux123",
  },
  affiliate: {
    email: "afiliado@mimelux.com.br",
    aliases: ["afiliado@patrocino.com", "afiliado@fanmimo.com", "afiliado@fanmimo.com.br"],
    password: "mimelux123",
  },
} as const;

function listed(email: string, values: readonly string[]) {
  const value = email.trim().toLowerCase();
  return values.includes(value);
}

export function isDemoCreatorEmail(email: string) {
  return listed(email, [
    DEMO_ACCOUNTS.creator.email,
    DEMO_ACCOUNTS.creator.alias,
    ...DEMO_ACCOUNTS.creator.aliases,
  ]);
}

export function isDemoAffiliateEmail(email: string) {
  return listed(email, [DEMO_ACCOUNTS.affiliate.email, ...DEMO_ACCOUNTS.affiliate.aliases]);
}

export function isDemoFanEmail(email: string) {
  return listed(email, [DEMO_ACCOUNTS.fan.email, ...DEMO_ACCOUNTS.fan.aliases]);
}

export function canonicalDemoEmail(email: string) {
  if (isDemoCreatorEmail(email)) return DEMO_ACCOUNTS.creator.email;
  if (isDemoAffiliateEmail(email)) return DEMO_ACCOUNTS.affiliate.email;
  if (isDemoFanEmail(email)) return DEMO_ACCOUNTS.fan.email;
  return email.trim().toLowerCase();
}

export const paymentProviders = ["pix", "stripe", "crypto"] as const;
export type PaymentProviderId = (typeof paymentProviders)[number];

export const payoutSchedules = ["weekly", "biweekly", "monthly"] as const;
export type PayoutSchedule = (typeof payoutSchedules)[number];

export const payoutSchedule: PayoutSchedule = payoutSchedules.includes(
  process.env.NEXT_PUBLIC_PAYOUT_SCHEDULE as PayoutSchedule,
)
  ? (process.env.NEXT_PUBLIC_PAYOUT_SCHEDULE as PayoutSchedule)
  : "weekly";

/** The displayed schedule is configurable and not yet confirmed by the owner. */
export const payoutScheduleConfirmed = false;

export const minimumPayoutCents = 5_000;
export const attributionWindowDays = 30;
export const commissionHoldDays = 10;
export const renewalCommissionMonths = 12;

export type CheckoutRequest = {
  provider: PaymentProviderId;
  amountCents: number;
  currency: "BRL";
  description: string;
  idempotencyKey: string;
};

export type PayoutRequest = {
  provider: PaymentProviderId;
  amountCents: number;
  destinationLabel: string;
};

export type SimulatedPayment = {
  id: string;
  provider: PaymentProviderId;
  status: "simulated";
  simulated: true;
};

export interface PaymentGateway {
  createCheckout(input: CheckoutRequest): Promise<SimulatedPayment>;
  recordConfirmedPayment(input: CheckoutRequest): Promise<SimulatedPayment>;
  requestPayout(input: PayoutRequest): Promise<SimulatedPayment>;
}
