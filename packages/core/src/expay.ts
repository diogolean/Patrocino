import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * ExPay Brasil client and webhook processor.
 *
 * The OpenAPI document was not in the workspace, so request and response
 * field names are isolated below. Endpoints, the X-API-Key header, Idempotency-Key
 * on POST /charges, and X-Request-Id follow the integration notes.
 *
 * TODO-to-confirm: webhook signature header. The default guess is
 * `X-Expay-Signature`. Override with EXPAY_WEBHOOK_SIGNATURE_HEADER.
 * The check is HMAC-SHA256 of the raw body. Hex (optional `sha256=` prefix)
 * and base64 digests are both accepted.
 *
 * TODO-to-confirm: admin refunds call POST /charges/{id}/refunds.
 * Pix Automático uses POST /pix-automatico/mandatos and POST /pix-automatico/cobrancas.
 */

export const EXPAY_DEFAULT_BASE_URL = "https://api.expaybrasil.com/api/v1";
export const EXPAY_SIGNATURE_HEADER_DEFAULT = "X-Expay-Signature";
export const EXPAY_WEBHOOK_URL = "https://patrocino.com/v1/payments/expay/webhook";

export const chargeStatuses = ["pending", "paid", "failed", "refunded", "canceled", "expired"] as const;
export type ChargeStatus = (typeof chargeStatuses)[number];

export const billingModes = ["pix_one_off", "pix_automatico", "pix_monthly_fallback"] as const;
export type BillingMode = (typeof billingModes)[number];

export const paymentPurposes = ["subscription", "post", "message", "pack", "special_request"] as const;
export type PaymentPurpose = (typeof paymentPurposes)[number];

export type ChargeCustomer = {
  name: string;
  email: string;
  document?: string;
};

export type ChargeDraft = {
  buyerId: string;
  creatorId: string;
  purpose: PaymentPurpose;
  subjectId: string;
  amountCents: number;
  description: string;
  customer: ChargeCustomer;
  idempotencyKey: string;
};

export type ChargeRecord = {
  providerChargeId: string;
  buyerId: string;
  creatorId: string;
  purpose: PaymentPurpose;
  subjectId: string;
  description: string;
  amountCents: number;
  currency: "BRL";
  status: ChargeStatus;
  billingMode: BillingMode;
  mandateId: string | null;
  copiaECola: string | null;
  qrCode: string | null;
  idempotencyKey: string;
  accessActive: boolean;
};

export type ReceiptRecord = {
  providerEventId: string;
  providerChargeId: string;
  eventType: string;
  processedAt: string | null;
};

export type MandateRecord = {
  providerMandateId: string;
  buyerId: string;
  creatorId: string;
  subjectId: string;
  amountCents: number;
  status: string;
};

export interface PaymentStore {
  findByIdempotency(key: string): Promise<ChargeRecord | null>;
  findByProviderChargeId(id: string): Promise<ChargeRecord | null>;
  insertCharge(charge: ChargeRecord): Promise<ChargeRecord>;
  saveStatus(providerChargeId: string, status: ChargeStatus, accessActive: boolean): Promise<ChargeRecord>;
  findReceipt(eventId: string): Promise<ReceiptRecord | null>;
  insertReceipt(receipt: ReceiptRecord & { payload: unknown }): Promise<ReceiptRecord>;
  saveMandate(mandate: MandateRecord): Promise<void>;
}

export class ExpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ExpayError";
  }
}

export type ExpayClient = {
  createCharge(draft: ChargeDraft): Promise<ParsedCharge>;
  getCharge(chargeId: string): Promise<ParsedCharge>;
  refundCharge(chargeId: string): Promise<void>;
  createMandate(draft: ChargeDraft): Promise<ParsedMandate>;
  createMandateCharge(mandateId: string, draft: ChargeDraft): Promise<ParsedCharge>;
};

export type ParsedCharge = {
  id: string;
  status: ChargeStatus;
  copiaECola: string | null;
  qrCode: string | null;
};

export type ParsedMandate = {
  id: string;
  status: string;
  charge: ParsedCharge | null;
};

type FetchLike = typeof fetch;

export function createExpayClient(config: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  notificationUrl?: string;
}): ExpayClient {
  const baseUrl = (config.baseUrl || EXPAY_DEFAULT_BASE_URL).replace(/\/$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;
  const notificationUrl = config.notificationUrl ?? EXPAY_WEBHOOK_URL;

  async function send(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string) {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-API-Key": config.apiKey,
      "X-Request-Id": randomUUID(),
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method === "POST" && idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? parseJson(text) : null;
    if (!response.ok) {
      throw new ExpayError(errorMessage(payload, response.status), response.status);
    }
    return payload;
  }

  return {
    createCharge(draft) {
      return send("POST", "/charges", chargeRequestBody(draft, notificationUrl), draft.idempotencyKey).then((payload) => {
        const charge = parseCharge(payload);
        if (!charge) throw new ExpayError("ExPay returned a charge without an id.", 502);
        return charge;
      });
    },
    getCharge(chargeId) {
      return send("GET", `/charges/${encodeURIComponent(chargeId)}`).then((payload) => {
        const charge = parseCharge(payload);
        if (!charge) throw new ExpayError("ExPay returned a charge without an id.", 502);
        return charge;
      });
    },
    async refundCharge(chargeId) {
      await send("POST", `/charges/${encodeURIComponent(chargeId)}/refunds`, {}, `refund:${chargeId}`);
    },
    createMandate(draft) {
      return send("POST", "/pix-automatico/mandatos", mandateRequestBody(draft, notificationUrl), `${draft.idempotencyKey}:mandate`).then(
        (payload) => {
          const mandate = parseMandate(payload);
          if (!mandate) throw new ExpayError("ExPay returned a mandate without an id.", 502);
          if (isMandateFailure(mandate.status)) throw new ExpayError("ExPay rejected the Pix Automático mandate.", 422);
          return mandate;
        },
      );
    },
    createMandateCharge(mandateId, draft) {
      return send(
        "POST",
        "/pix-automatico/cobrancas",
        {
          mandate_id: mandateId,
          amount: draft.amountCents,
          currency: "BRL",
          description: draft.description,
          notification_url: notificationUrl,
          metadata: metadata(draft),
        },
        `${draft.idempotencyKey}:cobranca`,
      ).then((payload) => {
        const charge = parseCharge(payload);
        if (!charge) throw new ExpayError("ExPay returned a collection without an id.", 502);
        return charge;
      });
    },
  };
}

export function chargeRequestBody(draft: ChargeDraft, notificationUrl = EXPAY_WEBHOOK_URL) {
  return {
    amount: draft.amountCents,
    currency: "BRL",
    payment_method: "pix",
    description: draft.description,
    notification_url: notificationUrl,
    customer: customerBody(draft.customer),
    metadata: metadata(draft),
  };
}

export function mandateRequestBody(draft: ChargeDraft, notificationUrl = EXPAY_WEBHOOK_URL) {
  return {
    amount: draft.amountCents,
    currency: "BRL",
    frequency: "monthly",
    description: draft.description,
    notification_url: notificationUrl,
    customer: customerBody(draft.customer),
    metadata: metadata(draft),
  };
}

function customerBody(customer: ChargeCustomer) {
  return {
    name: customer.name,
    email: customer.email,
    document: customer.document?.replace(/\D/g, "") || undefined,
  };
}

function metadata(draft: ChargeDraft) {
  return {
    buyerId: draft.buyerId,
    creatorId: draft.creatorId,
    purpose: draft.purpose,
    subjectId: draft.subjectId,
    idempotencyKey: draft.idempotencyKey,
  };
}

export async function createOneOffPixCharge(client: ExpayClient, store: PaymentStore, draft: ChargeDraft) {
  const existing = await store.findByIdempotency(draft.idempotencyKey);
  if (existing) return existing;
  const created = await client.createCharge(draft);
  return store.insertCharge(toRecord(draft, created, "pix_one_off", null));
}

export async function createSubscriptionPix(client: ExpayClient, store: PaymentStore, draft: ChargeDraft) {
  const existing = await store.findByIdempotency(draft.idempotencyKey);
  if (existing) return existing;
  try {
    const mandate = await client.createMandate(draft);
    await store.saveMandate({
      providerMandateId: mandate.id,
      buyerId: draft.buyerId,
      creatorId: draft.creatorId,
      subjectId: draft.subjectId,
      amountCents: draft.amountCents,
      status: mandate.status,
    });
    const created = mandate.charge ?? (await client.createMandateCharge(mandate.id, draft));
    return store.insertCharge(toRecord(draft, created, "pix_automatico", mandate.id));
  } catch {
    const created = await client.createCharge(draft);
    return store.insertCharge(toRecord(draft, created, "pix_monthly_fallback", null));
  }
}

export async function syncChargeFromExpay(client: ExpayClient, store: PaymentStore, providerChargeId: string) {
  const remote = await client.getCharge(providerChargeId);
  const local = await store.findByProviderChargeId(providerChargeId);
  if (!local) return null;
  return applyTrustedStatus(store, local, remote.status);
}

export async function refundAndSync(client: ExpayClient, store: PaymentStore, providerChargeId: string) {
  await client.refundCharge(providerChargeId);
  const updated = await syncChargeFromExpay(client, store, providerChargeId);
  if (!updated) throw new ExpayError("unknown_charge", 404);
  return updated;
}

export type WebhookResult = {
  accepted: boolean;
  duplicate?: boolean;
  processed?: boolean;
  reason?: string;
  status?: ChargeStatus;
};

/**
 * Verifies the signature, ignores a duplicate event id, then re-fetches
 * GET /charges/{id} and applies only that status.
 * A duplicate is ignored before the re-fetch so a replay cannot grant access twice.
 * A new event always re-fetches before any unlock or revoke.
 */
export async function processExpayWebhook(input: {
  rawBody: string;
  signature: string | undefined;
  secret: string;
  client: ExpayClient;
  store: PaymentStore;
}): Promise<WebhookResult> {
  if (!verifyExpayWebhookSignature(input.rawBody, input.signature, input.secret)) {
    return { accepted: false, reason: "invalid_signature" };
  }
  const event = parseWebhookEvent(input.rawBody);
  if (!event) return { accepted: false, reason: "invalid_payload" };
  const receipt = await input.store.findReceipt(event.id);
  if (receipt?.processedAt) return { accepted: true, duplicate: true, status: undefined };

  const remote = await input.client.getCharge(event.chargeId);
  const local = await input.store.findByProviderChargeId(event.chargeId);
  if (!local) {
    return { accepted: true, processed: false, reason: "unknown_charge" };
  }
  const updated = await applyTrustedStatus(input.store, local, remote.status);
  await input.store.insertReceipt({
    providerEventId: event.id,
    providerChargeId: event.chargeId,
    eventType: event.type,
    processedAt: new Date().toISOString(),
    payload: event.payload,
  });
  return { accepted: true, processed: true, duplicate: false, status: updated.status };
}

export async function applyTrustedStatus(store: PaymentStore, charge: ChargeRecord, status: ChargeStatus) {
  const accessActive = status === "paid" ? true : status === "refunded" || status === "canceled" ? false : charge.accessActive;
  if (charge.status === status && charge.accessActive === accessActive) return charge;
  return store.saveStatus(charge.providerChargeId, status, accessActive);
}

export function verifyExpayWebhookSignature(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature || !secret) return false;
  const provided = signature.trim().replace(/^sha256=/i, "");
  const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const base64 = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return fixedEqual(hex, provided) || fixedEqual(base64, provided);
}

export function readSignatureHeader(
  headers: Record<string, string | string[] | undefined>,
  name = EXPAY_SIGNATURE_HEADER_DEFAULT,
) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function parseCharge(payload: unknown): ParsedCharge | null {
  const body = unwrapCharge(payload);
  if (!body) return null;
  const id = pickString(body, ["id", "charge_id", "chargeId"]);
  const status = normalizeStatus(pickString(body, ["status"]));
  if (!id || !status) return null;
  const pix = asRecord(body.pix) ?? asRecord(body.payment) ?? {};
  return {
    id,
    status,
    copiaECola: pickString(pix, ["copia_e_cola", "copiaECola", "emv", "qr_code_text", "brcode", "payload"]),
    qrCode: pickString(pix, ["qr_code", "qrCode", "qr_code_base64", "qr_code_url", "image"]),
  };
}

export function parseMandate(payload: unknown): ParsedMandate | null {
  const body = asRecord(payload);
  if (!body) return null;
  const id = pickString(body, ["id", "mandate_id", "mandateId"]);
  if (!id) return null;
  const nested = body.charge ?? body.cobranca ?? body.first_charge;
  return {
    id,
    status: pickString(body, ["status"]) ?? "pending",
    charge: nested ? parseCharge(nested) : null,
  };
}

export function parseWebhookEvent(rawBody: string): { id: string; type: string; chargeId: string; payload: unknown } | null {
  const payload = parseJson(rawBody);
  const body = asRecord(payload);
  if (!body) return null;
  const data = asRecord(body.data) ?? {};
  const object = asRecord(data.object) ?? {};
  const id = pickString(body, ["id", "event_id", "eventId"]);
  const type = pickString(body, ["type", "event", "name"]);
  const chargeId =
    pickString(data, ["id", "charge_id", "chargeId"]) ??
    pickString(object, ["id", "charge_id", "chargeId"]) ??
    pickString(body, ["charge_id", "chargeId"]);
  if (!id || !type || !chargeId) return null;
  return { id, type, chargeId, payload };
}

export function normalizeStatus(value: string | null): ChargeStatus | null {
  if (!value) return null;
  const status = value.trim().toLowerCase();
  if (["paid", "approved", "succeeded", "completed", "pago"].includes(status)) return "paid";
  if (["pending", "waiting", "waiting_payment", "processing", "created", "active"].includes(status)) return "pending";
  if (["failed", "failure", "refused", "declined"].includes(status)) return "failed";
  if (["refunded", "refund", "estornado"].includes(status)) return "refunded";
  if (["canceled", "cancelled", "cancelado"].includes(status)) return "canceled";
  if (["expired", "expirado"].includes(status)) return "expired";
  return null;
}

export function createMemoryPaymentStore(): PaymentStore & { charges: () => ChargeRecord[] } {
  const charges = new Map<string, ChargeRecord>();
  const byKey = new Map<string, string>();
  const receipts = new Map<string, ReceiptRecord>();
  const mandates: MandateRecord[] = [];

  return {
    charges: () => [...charges.values()],
    async findByIdempotency(key) {
      const id = byKey.get(key);
      return id ? charges.get(id) ?? null : null;
    },
    async findByProviderChargeId(id) {
      return charges.get(id) ?? null;
    },
    async insertCharge(charge) {
      const current = byKey.get(charge.idempotencyKey);
      if (current) return charges.get(current) ?? charge;
      charges.set(charge.providerChargeId, charge);
      byKey.set(charge.idempotencyKey, charge.providerChargeId);
      return charge;
    },
    async saveStatus(providerChargeId, status, accessActive) {
      const current = charges.get(providerChargeId);
      if (!current) throw new ExpayError("unknown_charge", 404);
      const next = { ...current, status, accessActive };
      charges.set(providerChargeId, next);
      return next;
    },
    async findReceipt(eventId) {
      return receipts.get(eventId) ?? null;
    },
    async insertReceipt(receipt) {
      const existing = receipts.get(receipt.providerEventId);
      if (existing) return existing;
      const stored = {
        providerEventId: receipt.providerEventId,
        providerChargeId: receipt.providerChargeId,
        eventType: receipt.eventType,
        processedAt: receipt.processedAt,
      };
      receipts.set(receipt.providerEventId, stored);
      return stored;
    },
    async saveMandate(mandate) {
      mandates.push(mandate);
    },
  };
}

function toRecord(draft: ChargeDraft, created: ParsedCharge, billingMode: BillingMode, mandateId: string | null): ChargeRecord {
  return {
    providerChargeId: created.id,
    buyerId: draft.buyerId,
    creatorId: draft.creatorId,
    purpose: draft.purpose,
    subjectId: draft.subjectId,
    description: draft.description,
    amountCents: draft.amountCents,
    currency: "BRL",
    status: created.status,
    billingMode,
    mandateId,
    copiaECola: created.copiaECola,
    qrCode: created.qrCode,
    idempotencyKey: draft.idempotencyKey,
    accessActive: created.status === "paid",
  };
}

function isMandateFailure(status: string) {
  return ["failed", "failure", "rejected", "refused", "canceled", "cancelled"].includes(status.trim().toLowerCase());
}

function unwrapCharge(payload: unknown) {
  const body = asRecord(payload);
  if (!body) return null;
  return asRecord(body.data) ?? asRecord(body.charge) ?? body;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(body: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorMessage(payload: unknown, status: number) {
  const body = asRecord(payload);
  const message = body ? pickString(body, ["error_message", "message", "error"]) : null;
  if (!message || message.length > 180 || /key|secret|token/i.test(message)) return `ExPay request failed (${status}).`;
  return message;
}

function fixedEqual(expected: string, provided: string) {
  const left = Buffer.from(expected);
  const right = Buffer.alloc(left.length);
  Buffer.from(provided).copy(right);
  return timingSafeEqual(left, right) && provided.length === expected.length;
}
