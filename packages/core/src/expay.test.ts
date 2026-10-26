import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EXPAY_SIGNATURE_HEADER_DEFAULT,
  acceptExpayTestEvents,
  createExpayClient,
  createMemoryPaymentStore,
  createOneOffPixCharge,
  createSubscriptionPix,
  matchExpayWebhookEnvironment,
  processExpayWebhook,
  readExpayWebhookSecrets,
  readSignatureHeader,
  refundAndSync,
  verifyExpayWebhookSignature,
  type ChargeDraft,
  type ExpayWebhookSecrets,
} from "./expay";

const secret = "whsec_prod_only";
const testSecret = "whsec_test_only";
const secrets: ExpayWebhookSecrets = { test: testSecret, prod: secret };

const draft: ChargeDraft = {
  buyerId: "fan-1",
  creatorId: "creator-1",
  purpose: "post",
  subjectId: "post-9",
  amountCents: 1990,
  description: "Conteúdo exclusivo",
  customer: { name: "Apoiador", email: "fan@example.com", document: "123.456.789-09" },
  idempotencyKey: "post-fan-1-post-9",
};

function sign(body: string, key = secret) {
  return createHmac("sha256", key).update(body).digest("hex");
}

function fakeExpay(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const request = init ?? {};
    calls.push({ url, init: request });
    const result = handler(url, request);
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchImpl, calls };
}

describe("ExPay charges", () => {
  it("creates a Pix charge with the auth, idempotency, and request headers", async () => {
    const fake = fakeExpay(() => ({
      status: 201,
      body: {
        id: "ch_100",
        charge_id: "ch_100",
        status: "pending",
        amount: 19.9,
        currency: "BRL",
        payment_method: "pix",
        pix_data: {
          qr_code: "00020126580014br.gov.bcb.pix",
          qr_code_base64: "aaa",
          copy_paste: "00020126580014br.gov.bcb.pix",
        },
      },
    }));
    const client = createExpayClient({
      apiKey: "test_key",
      baseUrl: "https://api.expaybrasil.com/api/v1/",
      fetchImpl: fake.fetchImpl,
    });
    const store = createMemoryPaymentStore();
    const charge = await createOneOffPixCharge(client, store, draft);

    expect(charge.providerChargeId).toBe("ch_100");
    expect(charge.copiaECola).toContain("br.gov.bcb.pix");
    expect(charge.qrCode).toBe("data:image/png;base64,aaa");
    expect(charge.billingMode).toBe("pix_one_off");
    expect(charge.accessActive).toBe(false);
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.url).toBe("https://api.expaybrasil.com/api/v1/charges");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("test_key");
    expect(headers["Idempotency-Key"]).toBe(draft.idempotencyKey);
    expect(headers["X-Request-Id"]).toMatch(/[0-9a-f-]{36}/);
    const body = JSON.parse(String(call.init.body)) as {
      amount: number;
      currency: string;
      payment_method: string;
      reference: string;
      customer: { name: string; email: string; document: string };
      notification_url?: string;
    };
    expect(body).toEqual({
      amount: 19.9,
      currency: "BRL",
      payment_method: "pix",
      reference: draft.idempotencyKey,
      customer: { name: "Apoiador", email: "fan@example.com", document: "12345678909" },
    });
    expect(body.notification_url).toBeUndefined();
    expect(globalThis.fetch).not.toBe(fake.fetchImpl);
  });

  it("falls back to a monthly Pix when the mandate cannot be created", async () => {
    const fake = fakeExpay((url) => {
      if (url.endsWith("/pix-automatico/mandatos")) return { status: 422, body: { message: "mandate unavailable" } };
      return {
        status: 201,
        body: {
          id: "ch_month",
          status: "pending",
          pix_data: { qr_code: "00020126fallback", copy_paste: "00020126fallback" },
        },
      };
    });
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const store = createMemoryPaymentStore();
    const charge = await createSubscriptionPix(client, store, { ...draft, purpose: "subscription", subjectId: "plan-1" });

    expect(charge.billingMode).toBe("pix_monthly_fallback");
    expect(charge.copiaECola).toBe("00020126fallback");
    expect(charge.status).toBe("pending");
    expect(fake.calls.map((call) => call.url)).toEqual([
      "https://api.expaybrasil.com/api/v1/pix-automatico/mandatos",
      "https://api.expaybrasil.com/api/v1/charges",
    ]);
  });

  it("falls back to a monthly Pix when the mandate is not authorized yet", async () => {
    const fake = fakeExpay((url, init) => {
      if (url.endsWith("/pix-automatico/mandatos") && init.method === "POST") {
        return { status: 201, body: { mandate_id: "mandate-abc123" } };
      }
      if (url.includes("/pix-automatico/mandatos/")) {
        return { body: { mandate_id: "mandate-abc123", status: "pending" } };
      }
      return {
        status: 201,
        body: { id: "ch_month", status: "pending", pix_data: { copy_paste: "00020126pending" } },
      };
    });
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const charge = await createSubscriptionPix(client, createMemoryPaymentStore(), {
      ...draft,
      purpose: "subscription",
      subjectId: "plan-2",
      idempotencyKey: "sub-pending",
    });
    expect(charge.billingMode).toBe("pix_monthly_fallback");
    expect(charge.copiaECola).toBe("00020126pending");
    expect(fake.calls.map((call) => call.url)).toEqual([
      "https://api.expaybrasil.com/api/v1/pix-automatico/mandatos",
      "https://api.expaybrasil.com/api/v1/pix-automatico/mandatos/mandate-abc123",
      "https://api.expaybrasil.com/api/v1/charges",
    ]);
  });

  it("charges an authorized Pix Automático mandate and loads the Pix payload", async () => {
    const fake = fakeExpay((url, init) => {
      if (url.endsWith("/pix-automatico/mandatos") && init.method === "POST") {
        return { status: 201, body: { mandate_id: "mandate-abc123" } };
      }
      if (url.endsWith("/pix-automatico/mandatos/mandate-abc123")) {
        return { body: { mandate_id: "mandate-abc123", status: "authorized" } };
      }
      if (url.endsWith("/pix-automatico/cobrancas")) {
        return { status: 201, body: { charge_id: "charge-xyz789" } };
      }
      return {
        body: {
          id: "charge-xyz789",
          status: "pending",
          pix_data: {
            qr_code: "00020126auto",
            qr_code_base64: "aaa",
            copy_paste: "00020126auto",
          },
        },
      };
    });
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const charge = await createSubscriptionPix(client, createMemoryPaymentStore(), {
      ...draft,
      purpose: "subscription",
      idempotencyKey: "sub-1",
    });
    expect(charge.billingMode).toBe("pix_automatico");
    expect(charge.mandateId).toBe("mandate-abc123");
    expect(charge.providerChargeId).toBe("charge-xyz789");
    expect(charge.copiaECola).toBe("00020126auto");
    expect(charge.qrCode).toBe("data:image/png;base64,aaa");
    expect(fake.calls.map((call) => call.url)).toEqual([
      "https://api.expaybrasil.com/api/v1/pix-automatico/mandatos",
      "https://api.expaybrasil.com/api/v1/pix-automatico/mandatos/mandate-abc123",
      "https://api.expaybrasil.com/api/v1/pix-automatico/cobrancas",
      "https://api.expaybrasil.com/api/v1/charges/charge-xyz789",
    ]);
    const mandate = JSON.parse(String(fake.calls[0]!.init.body)) as Record<string, unknown>;
    expect(mandate).toEqual({
      customer_name: "Apoiador",
      customer_document: "12345678909",
      amount: 19.9,
      frequency: "mensal",
      description: "Conteúdo exclusivo",
    });
    const billed = JSON.parse(String(fake.calls[2]!.init.body)) as Record<string, unknown>;
    expect(billed).toEqual({
      mandate_id: "mandate-abc123",
      amount: 19.9,
      description: "Conteúdo exclusivo",
    });
  });

  it("uses a monthly Pix when the payer document is missing", async () => {
    const fake = fakeExpay(() => ({
      status: 201,
      body: { id: "ch_nodoc", status: "pending", pix_data: { copy_paste: "00020126nodoc" } },
    }));
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const charge = await createSubscriptionPix(client, createMemoryPaymentStore(), {
      ...draft,
      purpose: "subscription",
      customer: { name: "Apoiador", email: "fan@example.com" },
      idempotencyKey: "sub-nodoc",
    });
    expect(charge.billingMode).toBe("pix_monthly_fallback");
    expect(fake.calls.map((call) => call.url)).toEqual(["https://api.expaybrasil.com/api/v1/charges"]);
  });
});

describe("ExPay webhooks", () => {
  function paidClient(status: string) {
    return fakeExpay((url, init) => {
      if (init.method === "POST" && url.endsWith("/refund")) {
        return { body: { message: "Charge refunded successfully", charge: { id: "ch_100", status } } };
      }
      return { body: { id: "ch_100", status, pix_data: { copy_paste: "00020126" } } };
    });
  }

  async function seedPending() {
    const fake = fakeExpay(() => ({
      body: { id: "ch_100", status: "pending", pix_data: { copy_paste: "00020126" } },
    }));
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const store = createMemoryPaymentStore();
    await createOneOffPixCharge(client, store, draft);
    return store;
  }

  it("accepts a valid signature and rejects an invalid one", () => {
    const body = JSON.stringify({ id: "evt_1", type: "charge.paid" });
    expect(verifyExpayWebhookSignature(body, sign(body), secret)).toBe(true);
    expect(verifyExpayWebhookSignature(body, `sha256=${sign(body)}`, secret)).toBe(true);
    expect(verifyExpayWebhookSignature(body, "deadbeef", secret)).toBe(false);
    expect(verifyExpayWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyExpayWebhookSignature(body, sign(body), "")).toBe(false);
    expect(readSignatureHeader({ "x-expay-signature": "abc" }, EXPAY_SIGNATURE_HEADER_DEFAULT)).toBe("abc");
  });

  it("unlocks only after GET /charges confirms paid, and ignores a duplicate event", async () => {
    const store = await seedPending();
    const fake = paidClient("paid");
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const raw = JSON.stringify({
      id: "evt_paid",
      type: "charge.paid",
      data: { id: "ch_100", status: "pending" },
    });
    const first = await processExpayWebhook({ rawBody: raw, signature: sign(raw), secrets, acceptTestEvents: false, client, store });
    const second = await processExpayWebhook({ rawBody: raw, signature: sign(raw), secrets, acceptTestEvents: false, client, store });

    expect(first).toMatchObject({ accepted: true, processed: true, status: "paid", environment: "prod", accessApplied: true });
    expect(second).toMatchObject({ accepted: true, duplicate: true, environment: "prod", accessApplied: false });
    expect(store.charges()[0]).toMatchObject({ status: "paid", accessActive: true });
    expect(store.receipts()[0]).toMatchObject({ environment: "prod", providerEventId: "evt_paid" });
    expect(fake.calls.filter((call) => call.url.endsWith("/charges/ch_100"))).toHaveLength(1);
  });

  it("does not unlock when the event says paid but ExPay still says pending", async () => {
    const store = await seedPending();
    const fake = paidClient("pending");
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const raw = JSON.stringify({ id: "evt_early", type: "charge.paid", data: { id: "ch_100", status: "paid" } });
    const result = await processExpayWebhook({ rawBody: raw, signature: sign(raw), secrets, acceptTestEvents: false, client, store });
    expect(result.status).toBe("pending");
    expect(result.environment).toBe("prod");
    expect(store.charges()[0]?.accessActive).toBe(false);
  });

  it("rejects a bad signature before calling ExPay", async () => {
    const store = await seedPending();
    const fake = paidClient("paid");
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const raw = JSON.stringify({ id: "evt_bad", type: "charge.paid", data: { id: "ch_100" } });
    const result = await processExpayWebhook({ rawBody: raw, signature: "nope", secrets, acceptTestEvents: false, client, store });
    expect(result).toEqual({ accepted: false, reason: "invalid_signature" });
    expect(fake.calls).toHaveLength(0);
    expect(store.charges()[0]?.accessActive).toBe(false);
  });

  it("revokes access when a later refund is confirmed by ExPay", async () => {
    const store = await seedPending();
    const paid = paidClient("paid");
    await processExpayWebhook({
      rawBody: JSON.stringify({ id: "evt_paid", type: "charge.paid", data: { id: "ch_100" } }),
      signature: sign(JSON.stringify({ id: "evt_paid", type: "charge.paid", data: { id: "ch_100" } })),
      secrets,
      acceptTestEvents: false,
      client: createExpayClient({ apiKey: "test_key", fetchImpl: paid.fetchImpl }),
      store,
    });

    const refunded = paidClient("refunded");
    const raw = JSON.stringify({ id: "evt_refund", type: "charge.refunded", data: { id: "ch_100" } });
    const result = await processExpayWebhook({
      rawBody: raw,
      signature: sign(raw),
      secrets,
      acceptTestEvents: false,
      client: createExpayClient({ apiKey: "test_key", fetchImpl: refunded.fetchImpl }),
      store,
    });
    expect(result.status).toBe("refunded");
    expect(store.charges()[0]).toMatchObject({ status: "refunded", accessActive: false });

    const admin = paidClient("canceled");
    const revoked = await refundAndSync(
      createExpayClient({ apiKey: "test_key", fetchImpl: admin.fetchImpl }),
      store,
      "ch_100",
    );
    expect(revoked.accessActive).toBe(false);
    expect(revoked.status).toBe("canceled");
    const refund = admin.calls.find((call) => call.url.endsWith("/charges/ch_100/refund") && call.init.method === "POST");
    expect(refund).toBeTruthy();
    expect(JSON.parse(String(refund?.init.body))).toEqual({});
  });

  it("records a test signature without granting access, and still re-fetches the charge", async () => {
    const store = await seedPending();
    const fake = paidClient("paid");
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const raw = JSON.stringify({ id: "evt_test", type: "charge.paid", data: { id: "ch_100", status: "paid" } });
    const result = await processExpayWebhook({
      rawBody: raw,
      signature: sign(raw, testSecret),
      secrets,
      acceptTestEvents: false,
      client,
      store,
    });
    const replay = await processExpayWebhook({
      rawBody: raw,
      signature: sign(raw, testSecret),
      secrets,
      acceptTestEvents: false,
      client,
      store,
    });

    expect(result).toMatchObject({ accepted: true, processed: true, environment: "test", accessApplied: false, status: "paid" });
    expect(replay).toMatchObject({ accepted: true, duplicate: true, environment: "test" });
    expect(store.charges()[0]).toMatchObject({ status: "pending", accessActive: false });
    expect(store.receipts()).toEqual([
      expect.objectContaining({ providerEventId: "evt_test", environment: "test" }),
    ]);
    expect(fake.calls.filter((call) => call.url.endsWith("/charges/ch_100"))).toHaveLength(1);
  });

  it("grants access for a test signature only when test events are accepted", async () => {
    const store = await seedPending();
    const fake = paidClient("paid");
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const raw = JSON.stringify({ id: "evt_test_ok", type: "charge.paid", data: { id: "ch_100" } });
    const result = await processExpayWebhook({
      rawBody: raw,
      signature: sign(raw, testSecret),
      secrets,
      acceptTestEvents: true,
      client,
      store,
    });
    expect(result).toMatchObject({ environment: "test", accessApplied: true, status: "paid" });
    expect(store.charges()[0]).toMatchObject({ status: "paid", accessActive: true });
  });

  it("does not let a test refund revoke access that a prod event granted", async () => {
    const store = await seedPending();
    const paid = paidClient("paid");
    const rawPaid = JSON.stringify({ id: "evt_paid", type: "charge.paid", data: { id: "ch_100" } });
    await processExpayWebhook({
      rawBody: rawPaid,
      signature: sign(rawPaid),
      secrets,
      acceptTestEvents: false,
      client: createExpayClient({ apiKey: "test_key", fetchImpl: paid.fetchImpl }),
      store,
    });

    const refunded = paidClient("refunded");
    const raw = JSON.stringify({ id: "evt_test_refund", type: "charge.refunded", data: { id: "ch_100", status: "refunded" } });
    const result = await processExpayWebhook({
      rawBody: raw,
      signature: sign(raw, testSecret),
      secrets,
      acceptTestEvents: false,
      client: createExpayClient({ apiKey: "test_key", fetchImpl: refunded.fetchImpl }),
      store,
    });
    expect(result).toMatchObject({ environment: "test", accessApplied: false, status: "refunded" });
    expect(store.charges()[0]).toMatchObject({ status: "paid", accessActive: true });
    expect(refunded.calls.filter((call) => call.url.endsWith("/charges/ch_100"))).toHaveLength(1);
  });

  it("still grants access when the same event id arrives later with the prod secret", async () => {
    const store = await seedPending();
    const fake = paidClient("paid");
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const raw = JSON.stringify({ id: "evt_shared", type: "charge.paid", data: { id: "ch_100" } });
    await processExpayWebhook({
      rawBody: raw,
      signature: sign(raw, testSecret),
      secrets,
      acceptTestEvents: false,
      client,
      store,
    });
    const prod = await processExpayWebhook({
      rawBody: raw,
      signature: sign(raw),
      secrets,
      acceptTestEvents: false,
      client,
      store,
    });
    expect(prod).toMatchObject({ environment: "prod", accessApplied: true, status: "paid" });
    expect(store.charges()[0]).toMatchObject({ status: "paid", accessActive: true });
    expect(store.receipts().map((receipt) => receipt.environment).sort()).toEqual(["prod", "test"]);
    expect(fake.calls.filter((call) => call.url.endsWith("/charges/ch_100"))).toHaveLength(2);
  });

  it("tells the signing environment apart and keeps test access off in production by default", () => {
    const body = JSON.stringify({ id: "evt_env", type: "charge.paid", data: { id: "ch_100" } });
    expect(matchExpayWebhookEnvironment(body, sign(body), secrets)).toBe("prod");
    expect(matchExpayWebhookEnvironment(body, sign(body, testSecret), secrets)).toBe("test");
    expect(matchExpayWebhookEnvironment(body, sign(body), { test: secret, prod: secret })).toBe("prod");
    expect(matchExpayWebhookEnvironment(body, "nope", secrets)).toBeNull();
    expect(readExpayWebhookSecrets({ EXPAY_WEBHOOK_SECRET_TEST: " a ", EXPAY_WEBHOOK_SECRET_PROD: " " })).toEqual({
      test: "a",
      prod: undefined,
    });
    expect(acceptExpayTestEvents({ EXPAY_ACCEPT_TEST_EVENTS: "true", NODE_ENV: "production" })).toBe(true);
    expect(acceptExpayTestEvents({ EXPAY_ACCEPT_TEST_EVENTS: "false", NODE_ENV: "development" })).toBe(false);
    expect(acceptExpayTestEvents({ NODE_ENV: "production" })).toBe(false);
    expect(acceptExpayTestEvents({})).toBe(false);
    expect(acceptExpayTestEvents({ NODE_ENV: "development" })).toBe(true);
  });
});
