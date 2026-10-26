import { paymentMethodsEnabled, stripePublishableKey } from "@mimelux/core/stripe";

export const dynamic = "force-dynamic";

export function GET() {
  const methods = paymentMethodsEnabled();
  return Response.json({
    expay: methods.expay,
    stripe: methods.stripe,
    stripePublishableKey: methods.stripe ? stripePublishableKey() : null,
  });
}
