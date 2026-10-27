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
  processExpayWebhook,
  readExpayWebhookSecrets,
  readSignatureHeader,
  refundAndSync,
  syncChargeFromExpay,
} from "@mimelux/core/expay";
import { paymentMethodsEnabled } from "@mimelux/core/stripe";
import { requireUser } from "../auth/require-user";
import { createPrismaPaymentStore } from "./expay-store";
import { chargeDraftForUser, ensureQuotedPurchase, quoteCharge, quoteRequestSchema } from "./quote-charge";

function expayEnabled() {
  return paymentMethodsEnabled().expay;
}

function client() {
  const apiKey = process.env.EXPAY_API_KEY;
  if (!apiKey) throw new ServiceUnavailableException("ExPay is not configured.");
  return createExpayClient({
    apiKey,
    baseUrl: process.env.EXPAY_BASE_URL || EXPAY_DEFAULT_BASE_URL,
  });
}

function requireAdmin(authorization?: string) {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw new UnauthorizedException();
  try {
    const payload = verify(token, process.env.JWT_ACCESS_SECRET ?? "local-access-only") as { role?: string };
    if (payload.role !== "ADMIN") throw new ForbiddenException();
  } catch (error) {
    if (error instanceof ForbiddenException) throw error;
    throw new UnauthorizedException();
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
    if (!parsed.success) throw new BadRequestException("Invalid payment request.");
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
    if (!expayEnabled()) throw new ConflictException("ExPay is not the active payments provider.");
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
        throw new ConflictException("Idempotency key already used.");
      }
      if (error instanceof ExpayError) throw new ServiceUnavailableException(error.message);
      throw error;
    }
  }

  @Get("payments/expay/charges/:id")
  @ApiOperation({ summary: "Poll an ExPay charge. Access is granted only when the paid amount matches the stored amount." })
  async show(@Param("id") id: string) {
    if (!expayEnabled()) throw new ConflictException("ExPay is not the active payments provider.");
    const store = createPrismaPaymentStore();
    try {
      const charge = await syncChargeFromExpay(client(), store, id);
      if (!charge) throw new NotFoundException();
      return present(charge);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof ExpayError) throw new ServiceUnavailableException(error.message);
      throw error;
    }
  }

  @Post("payments/expay/charges/:id/refund")
  @HttpCode(200)
  @ApiOperation({ summary: "Ask ExPay to refund a charge. Admin only." })
  async refund(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    if (!expayEnabled()) throw new ConflictException("ExPay is not the active payments provider.");
    requireAdmin(authorization);
    const store = createPrismaPaymentStore();
    try {
      return present(await refundAndSync(client(), store, id));
    } catch (error) {
      if (error instanceof ExpayError && error.status === 404) throw new NotFoundException();
      if (error instanceof ExpayError) throw new ServiceUnavailableException(error.message);
      throw error;
    }
  }

  @Post("payments/expay/webhook")
  @HttpCode(200)
  @ApiOperation({ summary: "ExPay webhook. Access changes only after GET /charges/{id}, and only for the prod secret unless test events are accepted." })
  async webhook(@Req() request: RawBodyRequest<Request>) {
    const secrets = readExpayWebhookSecrets();
    if (!secrets.test && !secrets.prod) throw new ServiceUnavailableException("Webhook secret is not configured.");
    const headerName = process.env.EXPAY_WEBHOOK_SIGNATURE_HEADER || EXPAY_SIGNATURE_HEADER_DEFAULT;
    const rawBody = request.rawBody?.toString("utf8") ?? "";
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
      if (!result.accepted) throw new UnauthorizedException(result.reason);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (error instanceof ExpayError) throw new ServiceUnavailableException(error.message);
      throw error;
    }
  }
}
