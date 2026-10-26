import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Module, Param, Post, RawBodyRequest, Req, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import Stripe from "stripe";
import type { Request } from "express";
import { requireUser } from "../auth/require-user";
import { readStripePublishable, readStripeSecret, readStripeWebhookSecret } from "./payment-gateways";
import { handleStripeEvent, startPlanCheckout } from "./billing";
import { ExpayPaymentsController } from "./expay.controller";

const demoPurchaseSchema = z.object({ mode: z.literal("demo") });
const checkoutSchema = z.strictObject({
  provider: z.enum(["stripe", "pix", "crypto"]).default("stripe"),
  creatorId: z.string().min(1),
  planId: z.string().min(1),
});

function parseCheckout(body: unknown) {
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
  }
  return parsed.data;
}

@ApiTags("payments")
@Controller()
class PaymentsController {
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
    if (provider !== "stripe") return { accepted: false, reason: "provider_stubbed" };
    const secret = readStripeWebhookSecret();
    const key = readStripeSecret();
    if (!secret.ok || !key.ok || !request.rawBody) {
      return { accepted: false, reason: "stripe_webhook_not_configured" };
    }
    if (!signature) throw new BadRequestException("Invalid Stripe signature");
    const stripe = new Stripe(key.key);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.rawBody, signature, secret.key);
    } catch {
      throw new BadRequestException("Invalid Stripe signature");
    }
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
