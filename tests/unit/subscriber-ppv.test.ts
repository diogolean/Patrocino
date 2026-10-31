import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { sign } = createRequire(import.meta.url)("../../apps/api/node_modules/jsonwebtoken") as {
  sign: (payload: object, secret: string) => string;
};
import { database } from "../../packages/db/src/index";
import { processExpayWebhook, type ExpayClient } from "../../packages/core/src/expay";
import { createPrismaPaymentStore } from "../../apps/api/src/modules/payments/expay-store";
import { chargeDraftForUser, ensureQuotedPurchase } from "../../apps/api/src/modules/payments/quote-charge";
import { Writable } from "node:stream";
import { MediaController } from "../../apps/api/src/modules/media/media.module";
import { signMediaGrant } from "../../apps/api/src/modules/media/signed-url";
import { resolveVideoPrice, viewerCanReadPost } from "../../apps/api/src/modules/media/entitlement";
import { importCreatorMedia } from "../../apps/api/src/media-import";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const secret = process.env.JWT_ACCESS_SECRET ?? "local-access-only";

const ids = {
  fanId: "",
  outsiderId: "",
  creatorUserId: "",
  creatorId: "",
  username: "",
  planId: "",
  postId: "",
  customPostId: "",
  mediaId: "",
  chargeId: `chg-${suffix}`,
};

function statusOf(error: unknown) {
  if (error && typeof error === "object" && "getStatus" in error && typeof error.getStatus === "function") {
    return (error as { getStatus: () => number }).getStatus();
  }
  return 0;
}

function token(userId: string) {
  return `Bearer ${sign({ sub: userId }, secret)}`;
}

function memoryResponse() {
  const headers = new Map<string, string>();
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
  return Object.assign(sink, {
    setHeader(name: string, value: string | number) {
      headers.set(name.toLowerCase(), String(value));
    },
    status(code: number) {
      void code;
      return this;
    },
    headers,
    body() {
      return Buffer.concat(chunks);
    },
  });
}

function paidClient(amountCents: number): ExpayClient {
  const charge = {
    id: ids.chargeId,
    status: "paid" as const,
    amountCents,
    copiaECola: null,
    qrCode: null,
  };
  return {
    createCharge: async () => charge,
    getCharge: async () => charge,
    refundCharge: async () => undefined,
    createMandate: async () => ({ id: "mandate", status: "active", charge: null }),
    getMandate: async () => ({ id: "mandate", status: "active", charge: null }),
    createMandateCharge: async () => charge,
  };
}

function signBody(raw: string, webhookSecret: string) {
  return createHmac("sha256", webhookSecret).update(raw, "utf8").digest("hex");
}

describe("subscriber pay-per-view videos", () => {
  beforeAll(async () => {
    const fan = await database.user.create({
      data: {
        email: `ppv-fan-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Apoiador PPV", username: `ppvfan${suffix}` } },
      },
    });
    const outsider = await database.user.create({
      data: {
        email: `ppv-out-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
      },
    });
    const creatorUser = await database.user.create({
      data: {
        email: `ppv-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Criadora PPV", username: `ppvcreator${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle" } },
      },
      include: { creator: true },
    });
    const creator = creatorUser.creator!;
    const plan = await database.plan.create({
      data: {
        creatorId: creator.id,
        name: "Mensal",
        description: "Plano de teste",
        priceCents: 1000,
        durationMonths: 1,
        discountPercent: 0,
        active: true,
      },
    });
    const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await database.subscription.create({
      data: {
        fanId: fan.id,
        creatorId: creator.id,
        planId: plan.id,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: periodEnd,
        currentPeriodEnd: periodEnd,
      },
    });
    const post = await database.post.create({
      data: {
        creatorId: creator.id,
        caption: "Vídeo padrão",
        visibility: "SUBSCRIBER_PPV",
        priceCents: 100,
        publishedAt: new Date(Date.now() - 60_000),
        media: {
          create: {
            kind: "VIDEO",
            storageKey: `uploads/${creator.id}/private/sample.mp4`,
            mimeType: "video/mp4",
            previewKey: `uploads/${creator.id}/previews/sample.jpg`,
            posterKey: `uploads/${creator.id}/private/posters/sample.jpg`,
            private: true,
          },
        },
      },
      include: { media: true },
    });
    const custom = await database.post.create({
      data: {
        creatorId: creator.id,
        caption: "Vídeo com preço próprio",
        visibility: "SUBSCRIBER_PPV",
        priceCents: 250,
        publishedAt: new Date(Date.now() - 60_000),
      },
    });
    ids.fanId = fan.id;
    ids.outsiderId = outsider.id;
    ids.creatorUserId = creatorUser.id;
    ids.creatorId = creator.id;
    ids.username = `ppvcreator${suffix}`;
    ids.planId = plan.id;
    ids.postId = post.id;
    ids.mediaId = post.media[0]?.id ?? "";
    ids.customPostId = custom.id;
  });

  afterAll(async () => {
    if (ids.creatorId) {
      await database.paymentWebhookReceipt.deleteMany({ where: { providerChargeId: ids.chargeId } });
      await database.paymentRecord.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.ledgerEntry.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.purchase.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.media.deleteMany({ where: { post: { creatorId: ids.creatorId } } });
      await database.post.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.subscription.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.plan.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.creator.deleteMany({ where: { id: ids.creatorId } });
    }
    const userIds = [ids.fanId, ids.outsiderId, ids.creatorUserId].filter(Boolean);
    if (userIds.length) {
      await database.profile.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await database.$disconnect();
  });

  it("uses 100 cents when a subscriber video has no explicit price", () => {
    expect(resolveVideoPrice({ visibility: "SUBSCRIBER_PPV" })).toBe(100);
    expect(resolveVideoPrice({ visibility: "SUBSCRIBER_PPV", explicitCents: 250, defaultVideoPriceCents: 100 })).toBe(250);
    expect(resolveVideoPrice({ visibility: "SUBSCRIBER_PPV", explicitCents: null, defaultVideoPriceCents: 100 })).toBe(100);
    expect(resolveVideoPrice({ visibility: "PPV" })).toBeNull();
  });

  it("lets a non-subscriber buy at the guest price and a subscriber at the lower price", async () => {
    await database.post.update({
      where: { id: ids.postId },
      data: { guestPriceCents: 5900, guestPriceCentsUsd: 2400 },
    });
    const outsider = await chargeDraftForUser(
      { id: ids.outsiderId, email: `ppv-out-${suffix}@patrocino.test` },
      {
        creatorId: ids.username,
        purpose: "post",
        subjectId: ids.postId,
        amountCents: 1,
        buyerId: ids.fanId,
        idempotencyKey: `ppv-out-${suffix}`,
      },
    );
    expect(outsider.buyerId).toBe(ids.outsiderId);
    expect(outsider.amountCents).toBe(5900);

    const draft = await chargeDraftForUser(
      { id: ids.fanId, email: `ppv-fan-${suffix}@patrocino.test` },
      {
        creatorId: ids.creatorId,
        purpose: "post",
        subjectId: ids.postId,
        amountCents: 1,
        buyerId: "spoof",
        description: "client text",
        idempotencyKey: `ppv-buy-${suffix}`,
      },
    );
    expect(draft.buyerId).toBe(ids.fanId);
    expect(draft.amountCents).toBe(100);

    const custom = await chargeDraftForUser(
      { id: ids.fanId, email: `ppv-fan-${suffix}@patrocino.test` },
      {
        creatorId: ids.creatorId,
        purpose: "post",
        subjectId: ids.customPostId,
        amountCents: 1,
        idempotencyKey: `ppv-custom-${suffix}`,
      },
    );
    expect(custom.amountCents).toBe(250);

    const viewer = { id: ids.fanId, role: "FAN" };
    const post = {
      id: ids.postId,
      creatorId: ids.creatorId,
      visibility: "SUBSCRIBER_PPV",
      deletedAt: null,
      publishedAt: new Date(Date.now() - 60_000),
    };
    expect(await viewerCanReadPost({ user: viewer, owns: false, post })).toBe(false);

    const list = new MediaController();
    const hidden = await list.subscriberVideos(ids.username, token(ids.fanId));
    const locked = hidden.items.find((item) => item.id === ids.postId);
    expect(hidden.subscribed).toBe(true);
    expect(locked?.priceCents).toBe(100);
    expect(locked?.fileUrl).toBeNull();
    expect(locked?.previewUrl).toContain("/previews/");
    expect(JSON.stringify(hidden)).not.toContain("private/posters");
    expect(JSON.stringify(hidden)).not.toContain(`/v1/media/${ids.mediaId}/file`);
    const early = signMediaGrant({
      mediaId: ids.mediaId,
      userId: ids.fanId,
      exp: Math.floor(Date.now() / 1000) + 60,
      kind: "file",
    });
    await expect(list.file(ids.mediaId, undefined, undefined, memoryResponse() as never, early)).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 403,
    );
    await expect(
      list.file(
        ids.mediaId,
        undefined,
        undefined,
        memoryResponse() as never,
        signMediaGrant({ mediaId: ids.mediaId, userId: ids.fanId, exp: Math.floor(Date.now() / 1000) - 30, kind: "file" }),
      ),
    ).rejects.toSatisfy((error: unknown) => statusOf(error) === 401);

    const anonymous = await list.subscriberVideos(ids.username);
    expect(anonymous.subscribed).toBe(false);
    expect(anonymous.items.every((item) => item.fileUrl === null)).toBe(true);

    const purchase = await ensureQuotedPurchase(draft);
    expect(purchase.status).toBe("PENDING");
    expect(purchase.postId).toBe(ids.postId);
    expect(purchase.amountCents).toBe(100);

    const store = createPrismaPaymentStore();
    await store.insertCharge({
      providerChargeId: ids.chargeId,
      buyerId: ids.fanId,
      creatorId: ids.creatorId,
      purpose: "post",
      subjectId: ids.postId,
      description: draft.description,
      amountCents: draft.amountCents,
      currency: "BRL",
      status: "pending",
      billingMode: "pix_one_off",
      mandateId: null,
      copiaECola: null,
      qrCode: null,
      idempotencyKey: draft.idempotencyKey,
      accessActive: false,
    });

    const webhookSecret = `ppv-webhook-${suffix}`;
    const mismatch = JSON.stringify({ id: `evt-low-${suffix}`, type: "charge.paid", data: { id: ids.chargeId } });
    await processExpayWebhook({
      rawBody: mismatch,
      signature: signBody(mismatch, webhookSecret),
      secrets: { prod: webhookSecret },
      acceptTestEvents: false,
      client: paidClient(1),
      store,
    });
    const stillPending = await database.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(stillPending.status).toBe("PENDING");
    expect(await viewerCanReadPost({ user: viewer, owns: false, post })).toBe(false);

    const match = JSON.stringify({ id: `evt-ok-${suffix}`, type: "charge.paid", data: { id: ids.chargeId } });
    const unlocked = await processExpayWebhook({
      rawBody: match,
      signature: signBody(match, webhookSecret),
      secrets: { prod: webhookSecret },
      acceptTestEvents: false,
      client: paidClient(100),
      store,
    });
    expect(unlocked.accessApplied).toBe(true);
    const paid = await database.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(paid.status).toBe("PAID");
    const record = await database.paymentRecord.findUniqueOrThrow({ where: { providerChargeId: ids.chargeId } });
    expect(record.amountCents).toBe(100);
    expect(record.accessActive).toBe(true);
    expect(await viewerCanReadPost({ user: viewer, owns: false, post })).toBe(true);

    const visible = await list.subscriberVideos(ids.username, token(ids.fanId));
    const opened = visible.items.find((item) => item.id === ids.postId);
    expect(opened?.purchased).toBe(true);
    expect(opened?.fileUrl).toBeNull();
    expect(JSON.stringify(visible)).not.toContain(`/v1/media/${ids.mediaId}/file`);
    expect(visible.viewerHandle).toBe(`ppvfan${suffix}`);

    await expect(list.file(ids.mediaId, token(ids.fanId), undefined, memoryResponse() as never)).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 401,
    );
    const access = await list.access(ids.mediaId, token(ids.fanId));
    expect(access.handle).toBe(`ppvfan${suffix}`);
    const grant = new URL(access.url, "http://127.0.0.1").searchParams.get("token") ?? "";
    expect(grant.length).toBeGreaterThan(20);
    const root = await mkdtemp(path.join(tmpdir(), `ppv-file-${suffix}-`));
    process.env.MEDIA_ROOT = root;
    const relative = `uploads/${ids.creatorId}/private/sample.mp4`;
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), Buffer.from("entitled-bytes"));
    const playback = new MediaController();
    const response = memoryResponse();
    await playback.file(ids.mediaId, undefined, undefined, response as never, grant);
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.body().toString("utf8")).toBe("entitled-bytes");
    await rm(root, { recursive: true, force: true });
  });

  it("imports a creator folder once and keeps the chosen price", async () => {
    const root = await mkdtemp(path.join(tmpdir(), `ppv-import-${suffix}-`));
    const mediaRoot = path.join(root, "media");
    const pricedDir = path.join(root, "priced");
    const defaultDir = path.join(root, "default");
    process.env.MEDIA_ROOT = mediaRoot;
    const video = Buffer.alloc(64, 0);
    video.write("ftyp", 4, "ascii");
    video.write("isom", 8, "ascii");
    await mkdir(pricedDir, { recursive: true });
    await mkdir(defaultDir, { recursive: true });
    await writeFile(path.join(pricedDir, "clip.mp4"), video);
    const other = Buffer.from(video);
    other[20] = 7;
    await writeFile(path.join(defaultDir, "other.mp4"), other);

    const first = await importCreatorMedia({
      creator: ids.username,
      dir: pricedDir,
      access: "subscriber_ppv",
      priceCents: 250,
    });
    expect(first.created).toBe(1);
    expect(first.skipped).toBe(0);
    const again = await importCreatorMedia({
      creator: ids.username,
      dir: pricedDir,
      access: "subscriber_ppv",
      priceCents: 250,
    });
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(1);

    const imported = await database.post.findFirstOrThrow({
      where: { creatorId: ids.creatorId, caption: "clip.mp4" },
      include: { media: true },
    });
    expect(imported.priceCents).toBe(250);
    expect(imported.visibility).toBe("SUBSCRIBER_PPV");
    expect(imported.media[0]?.posterKey).toContain("/private/posters/");
    expect(imported.media[0]?.previewKey).toContain("/previews/");
    const poster = await readFile(path.join(mediaRoot, imported.media[0]?.posterKey ?? ""));
    expect(poster[0]).toBe(0xff);
    expect(poster[1]).toBe(0xd8);

    const fallback = await importCreatorMedia({
      creator: ids.username,
      dir: defaultDir,
      access: "subscriber_ppv",
    });
    expect(fallback.created).toBe(1);
    const pricedDefault = await database.post.findFirstOrThrow({
      where: { creatorId: ids.creatorId, caption: "other.mp4" },
    });
    expect(pricedDefault.priceCents).toBe(100);

    const m4vDir = path.join(root, "m4v");
    await mkdir(m4vDir, { recursive: true });
    const m4v = Buffer.alloc(64, 0);
    m4v.write("ftyp", 4, "ascii");
    m4v.write("M4V ", 8, "ascii");
    await writeFile(path.join(m4vDir, "clip.m4v"), m4v);
    const audio = Buffer.alloc(64, 0);
    audio.write("ftyp", 4, "ascii");
    audio.write("M4A ", 8, "ascii");
    await writeFile(path.join(m4vDir, "song.m4v"), audio);
    const importedM4v = await importCreatorMedia({
      creator: ids.username,
      dir: m4vDir,
      access: "subscriber_ppv",
      priceCents: 250,
    });
    expect(importedM4v.created).toBe(1);
    expect(importedM4v.skipped).toBe(1);
    const m4vPost = await database.post.findFirstOrThrow({
      where: { creatorId: ids.creatorId, caption: "clip.m4v" },
      include: { media: true },
    });
    expect(m4vPost.media[0]?.kind).toBe("VIDEO");
    expect(m4vPost.media[0]?.mimeType).toBe("video/mp4");
    expect(m4vPost.media[0]?.storageKey.endsWith(".mp4")).toBe(true);
    await rm(root, { recursive: true, force: true });
  });
});
