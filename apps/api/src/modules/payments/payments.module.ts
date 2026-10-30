import { apiError } from "../../http/api-error";
import { BadRequestException, Body, ConflictException, Controller, Get, Headers, HttpCode, HttpException, Module, Param, Post, RawBodyRequest, Req, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import Stripe from "stripe";
import type { Request } from "express";
import { database } from "@mimelux/db/runtime";
import { paymentMethodsEnabled } from "@mimelux/core/stripe";
import { requireUser } from "../auth/require-user";
import { paymentProvider, readStripePublishable, readStripeSecret, readStripeWebhookSecret } from "./payment-gateways";
import { handleStripeEvent, startPlanCheckout } from "./billing";
import { logPayment, stripeEventChargeId } from "./payment-log";
import { ExpayPaymentsController } from "./expay.controller";
import { chargeDraftForUser, ensureQuotedPurchase } from "./quote-charge";

const demoPurchaseSchema = z.object({ mode: z.literal("demo") });
const checkoutSchema = z.strictObject({
  provider: z.enum(["stripe", "pix", "crypto"]).default("stripe"),
  creatorId: z.string().min(1),
  planId: z.string().min(1),
});

function parseCheckout(body: unknown) {
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
  }
  return parsed.data;
}

@ApiTags("payments")
@Controller()
export class PaymentsController {
  @Get("payments/config")
  @ApiOperation({ summary: "Tell the client whether Stripe is configured" })
  config() {
    const secret = readStripeSecret();
    const publishable = readStripePublishable();
    if (!secret.ok || !publishable.ok) return { enabled: false, publishableKey: null, live: false };
    return { enabled: true, publishableKey: publishable.key, live: secret.live };
  }

  @Post("payments/checkout")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a purchase from a database plan and start checkout" })
  async createCheckout(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const user = await requireUser(authorization);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (record.provider === "stripe" && typeof record.purpose === "string") {
      if (!paymentMethodsEnabled().stripe) throw apiError(409, "STRIPE_IS_NOT_ENABLED", "Stripe is not enabled.");
      const draft = await chargeDraftForUser(user, body);
      const purchase = await ensureQuotedPurchase(draft);
      try {
        const checkout = await paymentProvider("stripe").createCheckout({
          purchaseId: purchase.id,
          amountCents: draft.amountCents,
          currency: "brl",
          description: draft.description,
          buyerId: user.id,
          creatorId: draft.creatorId,
          purpose: draft.purpose,
          subjectId: draft.subjectId,
        });
        if (checkout.externalId) {
          await database.purchase.update({ where: { id: purchase.id }, data: { providerRef: checkout.externalId } });
        }
        return {
          purchase: {
            id: purchase.id,
            buyerId: user.id,
            creatorId: draft.creatorId,
            subjectId: draft.subjectId,
            amountCents: draft.amountCents,
            status: purchase.status,
          },
          amountCents: draft.amountCents,
          ...checkout,
        };
      } catch (error) {
        if (error instanceof HttpException) throw error;
        const message = error instanceof Error ? error.message : "";
        if (!message || /secret|token|rk_|sk_/i.test(message)) {
          throw apiError(503, "STRIPE_IS_NOT_CONFIGURED", "Stripe is not configured.");
        }
        throw apiError(503, "STRIPE_IS_NOT_CONFIGURED", message);
      }
    }
    const input = parseCheckout(body);
    return startPlanCheckout(user, input);
  }

  @Post("purchases/:contentId/checkout")
  @HttpCode(202)
  @ApiOperation({ summary: "Accept a demo content purchase simulation" })
  checkout(@Param("contentId") contentId: string, @Body() body: unknown) {
    return {
      accepted: true,
      simulation: true,
      contentId,
      input: demoPurchaseSchema.parse(body),
    };
  }

  @Post("payments/webhooks/:provider")
  @HttpCode(200)
  async webhook(
    @Param("provider") provider: string,
    @Headers("stripe-signature") signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    const receivedAt = new Date().toISOString();
    if (provider !== "stripe") return { accepted: false, reason: "provider_stubbed" };
    const secret = readStripeWebhookSecret();
    const key = readStripeSecret();
    if (!secret.ok || !key.ok || !request.rawBody) {
      logPayment("payment.webhook.arrived", { provider: "stripe", chargeId: null, at: receivedAt, accepted: false });
      return { accepted: false, reason: "stripe_webhook_not_configured" };
    }
    if (!signature) {
      logPayment("payment.webhook.arrived", { provider: "stripe", chargeId: null, at: receivedAt, accepted: false });
      throw apiError(400, "INVALID_STRIPE_SIGNATURE", "Invalid Stripe signature");
    }
    const stripe = new Stripe(key.key);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.rawBody, signature, secret.key);
    } catch {
      logPayment("payment.webhook.arrived", { provider: "stripe", chargeId: null, at: receivedAt, accepted: false });
      throw apiError(400, "INVALID_STRIPE_SIGNATURE", "Invalid Stripe signature");
    }
    logPayment("payment.webhook.arrived", {
      provider: "stripe",
      chargeId: stripeEventChargeId(event),
      at: receivedAt,
      stripeEventId: event.id,
      stripeType: event.type,
      accepted: true,
    });
    try {
      const result = await handleStripeEvent(event);
      return { accepted: true, ...result };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) throw error;
      throw error;
    }
  }
}

@Module({ controllers: [PaymentsController, ExpayPaymentsController] })
export class PaymentsModule {}
