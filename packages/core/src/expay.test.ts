import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EXPAY_SIGNATURE_HEADER_DEFAULT,
  createExpayClient,
  createMemoryPaymentStore,
  createOneOffPixCharge,
  createSubscriptionPix,
  processExpayWebhook,
  readSignatureHeader,
  refundAndSync,
  verifyExpayWebhookSignature,
  type ChargeDraft,
} from "./expay";

const secret = "whsec_test_only";

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

function sign(body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
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
      body: {
        id: "ch_100",
        status: "pending",
        pix: { copia_e_cola: "00020126580014br.gov.bcb.pix", qr_code: "data:image/png;base64,aaa" },
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
    const body = JSON.parse(String(call.init.body)) as { amount: number; customer: { document: string }; notification_url: string };
    expect(body.amount).toBe(1990);
    expect(body.customer.document).toBe("12345678909");
    expect(body.notification_url).toBe("https://patrocino.com/v1/payments/expay/webhook");
    expect(globalThis.fetch).not.toBe(fake.fetchImpl);
  });

  it("falls back to a monthly Pix when the mandate cannot be created", async () => {
    const fake = fakeExpay((url) => {
      if (url.endsWith("/pix-automatico/mandatos")) return { status: 422, body: { message: "mandate unavailable" } };
      return {
        body: { id: "ch_month", status: "waiting_payment", pix: { emv: "00020126fallback" } },
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

  it("keeps Pix Automático when the mandate returns its first charge", async () => {
    const fake = fakeExpay(() => ({
      body: {
        id: "mdt_1",
        status: "pending",
        charge: { id: "ch_auto", status: "pending", pix: { qr_code_text: "00020126auto" } },
      },
    }));
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const charge = await createSubscriptionPix(client, createMemoryPaymentStore(), {
      ...draft,
      purpose: "subscription",
      idempotencyKey: "sub-1",
    });
    expect(charge.billingMode).toBe("pix_automatico");
    expect(charge.mandateId).toBe("mdt_1");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.url).toContain("/pix-automatico/mandatos");
  });
});

describe("ExPay webhooks", () => {
  function paidClient(status: string) {
    return fakeExpay((url, init) => {
      if (init.method === "POST" && url.endsWith("/refunds")) return { body: { id: "re_1" } };
      return { body: { id: "ch_100", status, pix: { copia_e_cola: "00020126" } } };
    });
  }

  async function seedPending() {
    const fake = fakeExpay(() => ({
      body: { id: "ch_100", status: "pending", pix: { copia_e_cola: "00020126" } },
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
    const first = await processExpayWebhook({ rawBody: raw, signature: sign(raw), secret, client, store });
    const second = await processExpayWebhook({ rawBody: raw, signature: sign(raw), secret, client, store });

    expect(first).toMatchObject({ accepted: true, processed: true, status: "paid" });
    expect(second).toMatchObject({ accepted: true, duplicate: true });
    expect(store.charges()[0]).toMatchObject({ status: "paid", accessActive: true });
    expect(fake.calls.filter((call) => call.url.endsWith("/charges/ch_100"))).toHaveLength(1);
  });

  it("does not unlock when the event says paid but ExPay still says pending", async () => {
    const store = await seedPending();
    const fake = paidClient("pending");
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const raw = JSON.stringify({ id: "evt_early", type: "charge.paid", data: { id: "ch_100", status: "paid" } });
    const result = await processExpayWebhook({ rawBody: raw, signature: sign(raw), secret, client, store });
    expect(result.status).toBe("pending");
    expect(store.charges()[0]?.accessActive).toBe(false);
  });

  it("rejects a bad signature before calling ExPay", async () => {
    const store = await seedPending();
    const fake = paidClient("paid");
    const client = createExpayClient({ apiKey: "test_key", fetchImpl: fake.fetchImpl });
    const raw = JSON.stringify({ id: "evt_bad", type: "charge.paid", data: { id: "ch_100" } });
    const result = await processExpayWebhook({ rawBody: raw, signature: "nope", secret, client, store });
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
      secret,
      client: createExpayClient({ apiKey: "test_key", fetchImpl: paid.fetchImpl }),
      store,
    });

    const refunded = paidClient("refunded");
    const raw = JSON.stringify({ id: "evt_refund", type: "charge.refunded", data: { id: "ch_100" } });
    const result = await processExpayWebhook({
      rawBody: raw,
      signature: sign(raw),
      secret,
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
    expect(admin.calls.some((call) => call.url.endsWith("/charges/ch_100/refunds") && call.init.method === "POST")).toBe(true);
  });
});
