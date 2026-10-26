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
import { z } from "zod";
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
import { createPrismaPaymentStore } from "./expay-store";

const createSchema = z.object({
  buyerId: z.string().min(1).max(120),
  creatorId: z.string().min(1).max(120),
  purpose: z.enum(["subscription", "post", "message", "pack", "special_request"]),
  subjectId: z.string().min(1).max(120),
  amountCents: z.number().int().positive(),
  description: z.string().min(1).max(240),
  customer: z.object({
    name: z.string().min(1).max(120),
    email: z.email(),
    document: z.string().min(11).max(18).optional(),
  }),
  idempotencyKey: z.string().min(8).max(200),
});

function expayEnabled() {
  return (process.env.PAYMENTS_PROVIDER ?? "demo") === "expay";
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
  @Post("payments/expay/charges")
  @ApiOperation({ summary: "Create an ExPay Pix charge or a Pix Automático subscription" })
  async create(@Body() body: unknown) {
    if (!expayEnabled()) throw new ConflictException("ExPay is not the active payments provider.");
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid payment request.");
    const store = createPrismaPaymentStore();
    const expay = client();
    try {
      const charge =
        parsed.data.purpose === "subscription"
          ? await createSubscriptionPix(expay, store, parsed.data)
          : await createOneOffPixCharge(expay, store, parsed.data);
      return present(charge);
    } catch (error) {
      if (error instanceof ExpayError) throw new ServiceUnavailableException(error.message);
      throw error;
    }
  }

  @Get("payments/expay/charges/:id")
  @ApiOperation({ summary: "Poll an ExPay charge and trust the status returned by ExPay" })
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
