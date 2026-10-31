import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Writable } from "node:stream";

const { sign } = createRequire(import.meta.url)("../../apps/api/node_modules/jsonwebtoken") as {
  sign: (payload: object, secret: string) => string;
};
import { database } from "../../packages/db/src/index";
import { processExpayWebhook, type ExpayClient } from "../../packages/core/src/expay";
import { createPrismaPaymentStore } from "../../apps/api/src/modules/payments/expay-store";
import { handleStripeEvent } from "../../apps/api/src/modules/payments/billing";
import { MediaController } from "../../apps/api/src/modules/media/media.module";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const secret = process.env.JWT_ACCESS_SECRET ?? "local-access-only";

function statusOf(error: unknown) {
  if (error && typeof error === "object" && "getStatus" in error && typeof error.getStatus === "function") {
    return (error as { getStatus: () => number }).getStatus();
  }
  return 0;
}

function token(userId: string) {
  return `Bearer ${sign({ sub: userId, role: "FAN" }, secret)}`;
}

function memoryResponse() {
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  return Object.assign(sink, {
    setHeader() {
      return this;
    },
    status() {
      return this;
    },
  });
}

describe("pay-per-view unlock and settlement", () => {
  const ids = { fanId: "", creatorId: "", boughtId: "", otherId: "", stripePostId: "", stripePurchaseId: "" };
  let root = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "ppv-settle-"));
    process.env.MEDIA_ROOT = root;
    const fan = await database.user.create({
      data: {
        email: `settle-fan-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Comprador", username: `settlefan${suffix}` } },
      },
    });
    const creatorUser = await database.user.create({
      data: {
        email: `settle-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Criadora", username: `settlecreator${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle", ownership: "HOUSE" } },
      },
      include: { creator: true },
    });
    const creatorId = creatorUser.creator!.id;
    async function video(caption: string) {
      const post = await database.post.create({
        data: {
          creatorId,
          caption,
          visibility: "PPV",
          priceCents: 4900,
          priceCentsUsd: 1900,
          publishedAt: new Date(),
          media: {
            create: {
              kind: "VIDEO",
              storageKey: "pending",
              mimeType: "video/mp4",
              private: true,
            },
          },
        },
        include: { media: true },
      });
      const media = post.media[0]!;
      const storageKey = `uploads/${creatorId}/private/${media.id}.mp4`;
      await mkdir(path.dirname(path.join(root, storageKey)), { recursive: true });
      await writeFile(path.join(root, storageKey), Buffer.from("video"));
      await database.media.update({ where: { id: media.id }, data: { storageKey } });
      return { postId: post.id, mediaId: media.id };
    }
    const bought = await video("Comprado");
    const other = await video("Outro");
    const stripePost = await video("Cartao");
    ids.fanId = fan.id;
    ids.creatorId = creatorId;
    ids.boughtId = bought.mediaId;
    ids.otherId = other.mediaId;
    ids.stripePostId = stripePost.postId;
    const purchase = await database.purchase.create({
      data: {
        buyerId: fan.id,
        creatorId,
        postId: stripePost.postId,
        kind: "POST",
        status: "PENDING",
        amountCents: 1900,
        currency: "USD",
        idempotencyKey: `stripe-ppv-${suffix}`,
      },
    });
    ids.stripePurchaseId = purchase.id;
  });

  afterAll(async () => {
    await database.ledgerEntry.deleteMany({ where: { purchase: { buyerId: ids.fanId } } });
    await database.paymentEvent.deleteMany({ where: { purchase: { buyerId: ids.fanId } } });
    await database.purchase.deleteMany({ where: { buyerId: ids.fanId } });
    await database.paymentRecord.deleteMany({ where: { buyerId: ids.fanId } });
    await database.media.deleteMany({ where: { post: { creatorId: ids.creatorId } } });
    await database.post.deleteMany({ where: { creatorId: ids.creatorId } });
    await database.creator.deleteMany({ where: { id: ids.creatorId } });
    await database.user.deleteMany({ where: { email: { contains: `settle-${suffix}` } } }).catch(() => undefined);
    await database.user.deleteMany({ where: { email: { in: [`settle-fan-${suffix}@patrocino.test`, `settle-creator-${suffix}@patrocino.test`] } } });
    if (root) await rm(root, { recursive: true, force: true });
    await database.$disconnect();
  });

  it("keeps unpaid media locked and unlocks only the paid video after ExPay or Stripe settlement", async () => {
    const media = new MediaController();
    await expect(media.access(ids.boughtId)).rejects.toSatisfy((error: unknown) => statusOf(error) === 401);
    await expect(media.access(ids.boughtId, token(ids.fanId))).rejects.toSatisfy((error: unknown) => statusOf(error) === 401);

    const idempotencyKey = `expay-ppv-${suffix}`;
    const purchase = await database.purchase.create({
      data: {
        buyerId: ids.fanId,
        creatorId: ids.creatorId,
        postId: (await database.media.findUniqueOrThrow({ where: { id: ids.boughtId } })).postId!,
        kind: "POST",
        status: "PENDING",
        amountCents: 4900,
        currency: "BRL",
        idempotencyKey,
      },
    });
    const store = createPrismaPaymentStore();
    const chargeId = `chg-${suffix}`;
    await store.insertCharge({
      providerChargeId: chargeId,
      buyerId: ids.fanId,
      creatorId: ids.creatorId,
      purpose: "post",
      subjectId: purchase.postId!,
      description: "Video",
      amountCents: 4900,
      currency: "BRL",
      status: "pending",
      billingMode: "pix_one_off",
      mandateId: null,
      copiaECola: null,
      qrCode: null,
      idempotencyKey,
      accessActive: false,
    });
    const webhookSecret = `settle-secret-${suffix}`;
    const body = JSON.stringify({ id: `evt-${suffix}`, type: "charge.paid", data: { id: chargeId } });
    const client: ExpayClient = {
      createCharge: async () => ({ id: chargeId, status: "paid", amountCents: 4900, copiaECola: null, qrCode: null }),
      getCharge: async () => ({ id: chargeId, status: "paid", amountCents: 4900, copiaECola: null, qrCode: null }),
      refundCharge: async () => undefined,
      createMandate: async () => ({ id: "m", status: "active", charge: null }),
      getMandate: async () => ({ id: "m", status: "active", charge: null }),
      createMandateCharge: async () => ({ id: chargeId, status: "paid", amountCents: 4900, copiaECola: null, qrCode: null }),
    };
    await processExpayWebhook({
      rawBody: body,
      signature: createHmac("sha256", webhookSecret).update(body, "utf8").digest("hex"),
      secrets: { prod: webhookSecret },
      acceptTestEvents: false,
      client,
      store,
    });
    const paid = await database.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: { ledgerEntries: true } });
    expect(paid.status).toBe("PAID");
    expect(paid.ledgerEntries.length).toBeGreaterThan(0);
    const access = await media.access(ids.boughtId, token(ids.fanId));
    expect(access.url).toContain(ids.boughtId);
    const response = memoryResponse();
    await media.file(ids.boughtId, undefined, undefined, response as never, new URL(access.url, "http://127.0.0.1").searchParams.get("token") ?? "");
    await expect(media.access(ids.otherId, token(ids.fanId))).rejects.toSatisfy((error: unknown) => statusOf(error) === 401);

    await handleStripeEvent({
      id: `evt-card-${suffix}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi_${suffix}`,
          amount: 1900,
          amount_received: 1900,
          metadata: { purchaseId: ids.stripePurchaseId, userId: ids.fanId },
        },
      },
    });
    const card = await database.purchase.findUniqueOrThrow({ where: { id: ids.stripePurchaseId }, include: { ledgerEntries: true } });
    expect(card.status).toBe("PAID");
    expect(card.ledgerEntries.some((entry) => entry.account === "platform_revenue" || entry.account === "creator_payable" || entry.account === "platform_cash")).toBe(true);
    const stripeMedia = await database.media.findFirstOrThrow({ where: { postId: ids.stripePostId } });
    const stripeAccess = await media.access(stripeMedia.id, token(ids.fanId));
    expect(stripeAccess.url).toContain(stripeMedia.id);
  });
});
