import { apiError } from "../../http/api-error";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { verify } from "jsonwebtoken";
import type { Request } from "express";
import {
  EXPAY_DEFAULT_BASE_URL,
  EXPAY_SIGNATURE_HEADER_DEFAULT,
  ExpayError,
  createExpayClient,
  createOneOffPixCharge,
  createSubscriptionPix,
  acceptExpayTestEvents,
  parseWebhookEvent,
  processExpayWebhook,
  readExpayWebhookSecrets,
  readSignatureHeader,
  refundAndSync,
  syncChargeFromExpay,
} from "@mimelux/core/expay";
import { paymentMethodsEnabled } from "@mimelux/core/stripe";
import { requireUser } from "../auth/require-user";
import { createPrismaPaymentStore } from "./expay-store";
import { listBuyerPaymentAlerts, markPaymentAlertSeen } from "./payment-alerts";
import { logPayment } from "./payment-log";
import { chargeDraftForUser, ensureQuotedPurchase, quoteCharge, quoteRequestSchema } from "./quote-charge";

function expayEnabled() {
  return paymentMethodsEnabled().expay;
}

function client() {
  const apiKey = process.env.EXPAY_API_KEY;
  if (!apiKey) throw apiError(503, "EXPAY_IS_NOT_CONFIGURED", "ExPay is not configured.");
  return createExpayClient({
    apiKey,
    baseUrl: process.env.EXPAY_BASE_URL || EXPAY_DEFAULT_BASE_URL,
  });
}

function requireAdmin(authorization?: string) {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw apiError(401, "MISSING_ACCESS_TOKEN", "Missing access token");
  try {
    const payload = verify(token, process.env.JWT_ACCESS_SECRET ?? "local-access-only") as { role?: string };
    if (payload.role !== "ADMIN") throw apiError(403, "ADMIN_ONLY", "Admin only");
  } catch (error) {
    if (error instanceof ForbiddenException) throw error;
    throw apiError(401, "INVALID_ACCESS_TOKEN", "Invalid access token");
  }
}

function present(charge: {
  providerChargeId: string;
  status: string;
  accessActive: boolean;
  billingMode: string;
  copiaECola: string | null;
  qrCode: string | null;
  amountCents: number;
}) {
  return {
    chargeId: charge.providerChargeId,
    status: charge.status,
    accessActive: charge.accessActive,
    billingMode: charge.billingMode,
    copiaECola: charge.copiaECola,
    qrCode: charge.qrCode,
    amountCents: charge.amountCents,
  };
}

@ApiTags("payments")
@Controller()
export class ExpayPaymentsController {
  @Post("payments/quote")
  @ApiOperation({ summary: "Price a purchase from the database for the signed-in fan" })
  async quote(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const user = await requireUser(authorization);
    const parsed = quoteRequestSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_PAYMENT_REQUEST", "Invalid payment request.");
    const quoted = await quoteCharge(user, parsed.data);
    return {
      amountCents: quoted.amountCents,
      description: quoted.description,
      creatorId: quoted.creatorId,
      subjectId: quoted.subjectId,
      purpose: quoted.purpose,
    };
  }

  @Post("payments/expay/charges")
  @ApiOperation({ summary: "Create an ExPay Pix charge priced from the database for the signed-in fan" })
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const user = await requireUser(authorization);
    if (!expayEnabled()) throw apiError(409, "EXPAY_IS_NOT_THE_ACTIVE_PAYMENTS_PROVIDER", "ExPay is not the active payments provider.");
    const draft = await chargeDraftForUser(user, body);
    await ensureQuotedPurchase(draft);
    const store = createPrismaPaymentStore();
    const expay = client();
    try {
      const charge =
        draft.purpose === "subscription"
          ? await createSubscriptionPix(expay, store, draft)
          : await createOneOffPixCharge(expay, store, draft);
      return present(charge);
    } catch (error) {
      if (error instanceof ExpayError && error.message === "idempotency_conflict") {
        throw apiError(409, "IDEMPOTENCY_KEY_ALREADY_USED", "Idempotency key already used.");
      }
      if (error instanceof ExpayError) throw apiError(503, "EXPAY_UNAVAILABLE", error.message);
      throw error;
    }
  }

  @Get("payments/expay/alerts")
  @ApiOperation({ summary: "Pending ExPay charges and paid charges this buyer has not been shown yet" })
  async alerts(@Headers("authorization") authorization: string | undefined) {
    const user = await requireUser(authorization);
    return { items: await listBuyerPaymentAlerts(user.id) };
  }

  @Post("payments/expay/alerts/:id/seen")
  @HttpCode(200)
  @ApiOperation({ summary: "Remember that this buyer already saw the payment confirmed alert" })
  async seen(@Param("id") id: string, @Headers("authorization") authorization: string | undefined) {
    const user = await requireUser(authorization);
    return markPaymentAlertSeen(user.id, id);
  }

  @Get("payments/expay/charges/:id")
  @ApiOperation({ summary: "Poll an ExPay charge. Access is granted only when the paid amount matches the stored amount." })
  async show(@Param("id") id: string) {
    if (!expayEnabled()) throw apiError(409, "EXPAY_IS_NOT_THE_ACTIVE_PAYMENTS_PROVIDER", "ExPay is not the active payments provider.");
    const store = createPrismaPaymentStore();
    try {
      const charge = await syncChargeFromExpay(client(), store, id);
      if (!charge) throw apiError(404, "CHARGE_NOT_FOUND", "Charge not found");
      return present(charge);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof ExpayError) throw apiError(503, "EXPAY_UNAVAILABLE", error.message);
      throw error;
    }
  }

  @Post("payments/expay/charges/:id/refund")
  @HttpCode(200)
  @ApiOperation({ summary: "Ask ExPay to refund a charge. Admin only." })
  async refund(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    if (!expayEnabled()) throw apiError(409, "EXPAY_IS_NOT_THE_ACTIVE_PAYMENTS_PROVIDER", "ExPay is not the active payments provider.");
    requireAdmin(authorization);
    const store = createPrismaPaymentStore();
    try {
      return present(await refundAndSync(client(), store, id));
    } catch (error) {
      if (error instanceof ExpayError && error.status === 404) throw apiError(404, "CHARGE_NOT_FOUND", "Charge not found");
      if (error instanceof ExpayError) throw apiError(503, "EXPAY_UNAVAILABLE", error.message);
      throw error;
    }
  }

  @Post("payments/expay/webhook")
  @HttpCode(200)
  @ApiOperation({ summary: "ExPay webhook. Access changes only after GET /charges/{id}, and only for the prod secret unless test events are accepted." })
  async webhook(@Req() request: RawBodyRequest<Request>) {
    const receivedAt = new Date().toISOString();
    const rawBody = request.rawBody?.toString("utf8") ?? "";
    const hinted = parseWebhookEvent(rawBody);
    logPayment("payment.webhook.arrived", {
      provider: "expay",
      chargeId: hinted?.chargeId ?? null,
      at: receivedAt,
    });
    const secrets = readExpayWebhookSecrets();
    if (!secrets.test && !secrets.prod) throw apiError(503, "WEBHOOK_SECRET_IS_NOT_CONFIGURED", "Webhook secret is not configured.");
    const headerName = process.env.EXPAY_WEBHOOK_SIGNATURE_HEADER || EXPAY_SIGNATURE_HEADER_DEFAULT;
    const signature = readSignatureHeader(request.headers as Record<string, string | string[] | undefined>, headerName);
    try {
      const result = await processExpayWebhook({
        rawBody,
        signature,
        secrets,
        acceptTestEvents: acceptExpayTestEvents(),
        client: client(),
        store: createPrismaPaymentStore(),
      });
      if (!result.accepted) throw apiError(401, "WEBHOOK_REJECTED", result.reason || "Webhook was rejected");
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (error instanceof ExpayError) throw apiError(503, "EXPAY_UNAVAILABLE", error.message);
      throw error;
    }
  }
}
