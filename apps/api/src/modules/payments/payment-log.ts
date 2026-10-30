export type PaymentLogFields = {
  provider: string;
  chargeId?: string | null;
  at?: string;
} & Record<string, unknown>;

export function paymentLogRecord(event: string, fields: PaymentLogFields) {
  const { provider, chargeId = null, at, ...rest } = fields;
  return {
    event,
    provider,
    chargeId,
    at: at ?? new Date().toISOString(),
    ...rest,
  };
}

export function logPayment(event: string, fields: PaymentLogFields) {
  console.log(JSON.stringify(paymentLogRecord(event, fields)));
}

export function stripeEventChargeId(event: { type: string; data: { object: unknown } }) {
  const object =
    event.data.object && typeof event.data.object === "object"
      ? (event.data.object as Record<string, unknown>)
      : {};
  const id = typeof object.id === "string" ? object.id : null;
  const paymentIntent = object.payment_intent;
  const paymentIntentId =
    typeof paymentIntent === "string"
      ? paymentIntent
      : paymentIntent && typeof paymentIntent === "object" && typeof (paymentIntent as { id?: unknown }).id === "string"
        ? (paymentIntent as { id: string }).id
        : null;
  if (event.type.startsWith("payment_intent.")) return id;
  if (event.type.startsWith("charge.")) return id ?? paymentIntentId;
  return paymentIntentId ?? id;
}
