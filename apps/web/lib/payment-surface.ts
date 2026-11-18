export type PaymentMethodState = { expay: boolean; stripe: boolean } | null;

/** Demo UI only after the provider response says no real method is configured. */
export function checkoutSurface(methods: PaymentMethodState): "pending" | "live" | "demo" {
  if (!methods) return "pending";
  if (methods.expay || methods.stripe) return "live";
  return "demo";
}
