import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { MediaController } from "../../apps/api/src/modules/media/media.module";
import {
  posterKeyFor,
  previewKeyFor,
  staticMediaUrl,
} from "../../apps/api/src/modules/media/derivative-access";
import { sealInactiveCreatorDerivatives } from "../../apps/api/src/modules/media/derivative-access";
import { signMediaGrant } from "../../apps/api/src/modules/media/signed-url";
import { publicMediaAllowed } from "../../apps/web/lib/public-media";

const { sign } = createRequire(import.meta.url)("../../apps/api/node_modules/jsonwebtoken") as {
  sign: (payload: object, secret: string) => string;
};

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const secret = process.env.JWT_ACCESS_SECRET ?? "local-access-only";
const previousRoot = process.env.MEDIA_ROOT;

const ids = {
  adminId: "",
  fanId: "",
  buyerId: "",
  ownerId: "",
  otherId: "",
  creatorId: "",
  username: "",
  postId: "",
  mediaId: "",
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

function grant(userId: string, kind: "poster" | "preview" | "file") {
  return signMediaGrant({
    mediaId: ids.mediaId,
    userId,
    exp: Math.floor(Date.now() / 1000) + 120,
    kind,
  });
}

function caddyPrivateRegexp() {
  const text = readFileSyncCaddy();
  const line = text.split("\n").find((item) => item.includes("@private path_regexp"));
  if (!line) throw new Error("Caddyfile is missing the private matcher");
  const source = line.slice(line.indexOf("path_regexp") + "path_regexp".length).trim();
  const insensitive = source.startsWith("(?i)");
  return new RegExp(insensitive ? source.slice(4) : source, insensitive ? "i" : "");
}

function readFileSyncCaddy() {
  const { readFileSync } = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
  return readFileSync(new URL("../../Caddyfile", import.meta.url), "utf8");
}

describe("private derivative paths", () => {
  it("keeps the static disk from serving nested private posters and previews", () => {
    const pattern = caddyPrivateRegexp();
    const caddy = readFileSyncCaddy();
    expect(caddy).not.toContain("@private path /media/uploads/*/private");
    expect(caddy).toContain('header Cache-Control "private, no-store"');
    for (const blocked of [
      "/media/uploads/creator/private/posters/frame.jpg",
      "/media/uploads/creator/private/previews/frame.jpg",
      "/media/uploads/creator/private/original.mp4",
      "/media/uploads/creator/private",
      "/media/uploads/creator/tmp/upload/0.part",
      "/media/uploads/creator/PRIVATE/Posters/frame.jpg",
    ]) {
      expect(pattern.test(blocked)).toBe(true);
    }
    for (const allowed of [
      "/media/uploads/creator/previews/frame.jpg",
      "/media/uploads/creator/posters/frame.jpg",
      "/media/uploads/creator/public/original.jpg",
      "/media/models/demo/luna-ferraz/v001.jpg",
      "/media/uploads/creator/privateer/frame.jpg",
    ]) {
      expect(pattern.test(allowed)).toBe(false);
    }
    expect(publicMediaAllowed(["uploads", "creator", "private", "posters", "frame.jpg"])).toBe(false);
    expect(publicMediaAllowed(["uploads", "creator", "private", "previews", "frame.jpg"])).toBe(false);
    expect(publicMediaAllowed(["uploads", "creator", "previews", "frame.jpg"])).toBe(true);
  });

  it("puts teasers on the public disk only for an ACTIVE creator", () => {
    expect(previewKeyFor({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE" })).toBe("uploads/c/previews/m.jpg");
    expect(previewKeyFor({ creatorId: "c", mediaId: "m", creatorStatus: "DRAFT" })).toBe("uploads/c/private/previews/m.jpg");
    expect(posterKeyFor({ creatorId: "c", mediaId: "m", visibility: "SUBSCRIBER_PPV", creatorStatus: "ACTIVE" })).toBe(
      "uploads/c/private/posters/m.jpg",
    );
    expect(posterKeyFor({ creatorId: "c", mediaId: "m", visibility: "FREE", creatorStatus: "ACTIVE" })).toBe(
      "uploads/c/posters/m.jpg",
    );
    expect(posterKeyFor({ creatorId: "c", mediaId: "m", visibility: "FREE", creatorStatus: "SUSPENDED" })).toBe(
      "uploads/c/private/posters/m.jpg",
    );
    expect(staticMediaUrl("uploads/c/previews/m.jpg", "9")).toBe("/media/uploads/c/previews/m.jpg?v=9");
    expect(staticMediaUrl("uploads/c/private/previews/m.jpg")).toBeNull();
    expect(staticMediaUrl("uploads/c/private/posters/m.jpg")).toBeNull();
  });
});

describe("access-checked posters and previews", () => {
  let root = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), `private-derivatives-${suffix}-`));
    process.env.MEDIA_ROOT = root;
    const admin = await database.user.create({
      data: { email: `deriv-admin-${suffix}@patrocino.test`, passwordHash: "test-only", role: "ADMIN" },
    });
    const fan = await database.user.create({
      data: { email: `deriv-fan-${suffix}@patrocino.test`, passwordHash: "test-only", role: "FAN" },
    });
    const buyer = await database.user.create({
      data: { email: `deriv-buyer-${suffix}@patrocino.test`, passwordHash: "test-only", role: "FAN" },
    });
    const other = await database.user.create({
      data: {
        email: `deriv-other-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        creator: { create: { status: "ACTIVE", category: "Geral" } },
      },
    });
    const owner = await database.user.create({
      data: {
        email: `deriv-owner-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Rascunho", username: `deriv${suffix}` } },
        creator: { create: { status: "DRAFT", category: "Geral" } },
      },
      include: { creator: true },
    });
    const creator = owner.creator!;
    const post = await database.post.create({
      data: {
        creatorId: creator.id,
        caption: "Vídeo oculto",
        visibility: "SUBSCRIBER_PPV",
        priceCents: 100,
        publishedAt: new Date(Date.now() - 60_000),
        media: {
          create: {
            kind: "VIDEO",
            storageKey: `uploads/${creator.id}/private/${suffix}.mp4`,
            mimeType: "video/mp4",
            previewKey: `uploads/${creator.id}/previews/will-be-sealed.jpg`,
            posterKey: `uploads/${creator.id}/private/posters/clear.jpg`,
            private: true,
          },
        },
      },
      include: { media: true },
    });
    const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const plan = await database.plan.create({
      data: {
        creatorId: creator.id,
        name: "Mensal",
        description: "Teste",
        priceCents: 1000,
        durationMonths: 1,
        discountPercent: 0,
        active: true,
      },
    });
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
    await database.purchase.create({
      data: {
        buyerId: buyer.id,
        creatorId: creator.id,
        postId: post.id,
        kind: "POST",
        status: "PAID",
        amountCents: 100,
        idempotencyKey: `deriv-buy-${suffix}`,
      },
    });
    const media = post.media[0]!;
    await mkdir(path.dirname(path.join(root, media.previewKey!)), { recursive: true });
    await mkdir(path.dirname(path.join(root, media.posterKey!)), { recursive: true });
    await writeFile(path.join(root, media.previewKey!), Buffer.from("blurred-draft"));
    await writeFile(path.join(root, media.posterKey!), Buffer.from("clear-poster"));
    ids.adminId = admin.id;
    ids.fanId = fan.id;
    ids.buyerId = buyer.id;
    ids.ownerId = owner.id;
    ids.otherId = other.id;
    ids.creatorId = creator.id;
    ids.username = `deriv${suffix}`;
    ids.postId = post.id;
    ids.mediaId = media.id;
    await sealInactiveCreatorDerivatives();
  });

  afterAll(async () => {
    if (previousRoot === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = previousRoot;
    if (root) await rm(root, { recursive: true, force: true });
    if (ids.creatorId) {
      await database.purchase.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.subscription.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.plan.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.media.deleteMany({ where: { post: { creatorId: ids.creatorId } } });
      await database.post.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.creator.deleteMany({ where: { id: ids.creatorId } });
    }
    if (ids.otherId) {
      const otherCreator = await database.creator.findUnique({ where: { userId: ids.otherId } });
      if (otherCreator) await database.creator.delete({ where: { id: otherCreator.id } });
    }
    const userIds = [ids.adminId, ids.fanId, ids.buyerId, ids.ownerId, ids.otherId].filter(Boolean);
    if (userIds.length) {
      await database.profile.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it("hides a DRAFT creator from anonymous and non-entitled viewers and serves admins and the owner", async () => {
    const saved = await database.media.findUniqueOrThrow({ where: { id: ids.mediaId } });
    expect(saved.previewKey).toBe(`uploads/${ids.creatorId}/private/previews/${ids.mediaId}.jpg`);
    expect(saved.posterKey).toBe(`uploads/${ids.creatorId}/private/posters/${ids.mediaId}.jpg`);
    expect(await readFile(path.join(root, saved.previewKey!))).toEqual(Buffer.from("blurred-draft"));
    await expect(readFile(path.join(root, `uploads/${ids.creatorId}/previews/will-be-sealed.jpg`))).rejects.toThrow();

    const controller = new MediaController();
    const anonymousPoster = memoryResponse();
    await expect(controller.poster(ids.mediaId, anonymousPoster as never)).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 401,
    );
    expect(anonymousPoster.headers.get("cache-control")).toBe("private, no-store");
    expect(anonymousPoster.headers.get("cdn-cache-control")).toBe("no-store");
    const anonymousPreview = memoryResponse();
    await expect(controller.preview(ids.mediaId, anonymousPreview as never)).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 401,
    );

    for (const userId of [ids.fanId, ids.buyerId, ids.otherId]) {
      await expect(controller.poster(ids.mediaId, memoryResponse() as never, grant(userId, "poster"))).rejects.toSatisfy(
        (error: unknown) => statusOf(error) === 403,
      );
      await expect(controller.preview(ids.mediaId, memoryResponse() as never, grant(userId, "preview"))).rejects.toSatisfy(
        (error: unknown) => statusOf(error) === 403,
      );
    }
    await expect(controller.poster(ids.mediaId, memoryResponse() as never, grant(ids.adminId, "file"))).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 401,
    );

    for (const userId of [ids.adminId, ids.ownerId]) {
      const poster = memoryResponse();
      await controller.poster(ids.mediaId, poster as never, grant(userId, "poster"));
      expect(poster.headers.get("cache-control")).toBe("private, no-store");
      expect(poster.headers.get("cdn-cache-control")).toBe("no-store");
      expect(poster.headers.get("content-type")).toBe("image/jpeg");
      expect(poster.body().toString("utf8")).toBe("clear-poster");
      const preview = memoryResponse();
      await controller.preview(ids.mediaId, preview as never, grant(userId, "preview"));
      expect(preview.headers.get("cache-control")).toBe("private, no-store");
      expect(preview.body().toString("utf8")).toBe("blurred-draft");
    }

    const listed = await controller.list(token(ids.adminId), ids.creatorId);
    const item = listed.items.find((entry) => entry.id === ids.postId);
    expect(item?.previewUrl?.startsWith(`/v1/media/${ids.mediaId}/preview?token=`)).toBe(true);
    expect(item?.posterUrl).toBeNull();
    expect(JSON.stringify(listed)).not.toContain("private/");
    expect(JSON.stringify(listed)).not.toContain("/media/uploads/");
  });

  it("keeps PENDING and SUSPENDED derivatives limited to admins and the owner", async () => {
    const controller = new MediaController();
    for (const status of ["PENDING", "SUSPENDED"] as const) {
      await database.creator.update({ where: { id: ids.creatorId }, data: { status } });
      await expect(controller.preview(ids.mediaId, memoryResponse() as never, grant(ids.fanId, "preview"))).rejects.toSatisfy(
        (error: unknown) => statusOf(error) === 403,
      );
      const poster = memoryResponse();
      await controller.poster(ids.mediaId, poster as never, grant(ids.adminId, "poster"));
      expect(poster.body().toString("utf8")).toBe("clear-poster");
      const ownerPreview = memoryResponse();
      await controller.preview(ids.mediaId, ownerPreview as never, grant(ids.ownerId, "preview"));
      expect(ownerPreview.body().toString("utf8")).toBe("blurred-draft");
    }
  });

  it("publishes the ACTIVE blurred teaser and keeps the clear poster behind a purchase", async () => {
    await database.creator.update({ where: { id: ids.creatorId }, data: { status: "ACTIVE" } });
    const controller = new MediaController();
    const anonymous = await controller.subscriberVideos(ids.username);
    const card = anonymous.items.find((item) => item.id === ids.postId);
    expect(anonymous.subscribed).toBe(false);
    expect(card?.fileUrl).toBeNull();
    expect(card?.posterUrl).toBeNull();
    expect(card?.previewUrl).toMatch(new RegExp(`^/media/uploads/${ids.creatorId}/previews/${ids.mediaId}\\.jpg`));
    expect(JSON.stringify(anonymous)).not.toContain("private/");
    expect(publicMediaAllowed(["uploads", ids.creatorId, "previews", `${ids.mediaId}.jpg`])).toBe(true);
    const relative = card?.previewUrl?.split("?")[0]?.replace(/^\/media\//, "") ?? "";
    expect(await readFile(path.join(root, relative))).toEqual(Buffer.from("blurred-draft"));
    await expect(readFile(path.join(root, `uploads/${ids.creatorId}/private/previews/${ids.mediaId}.jpg`))).rejects.toThrow();
    expect(await readFile(path.join(root, `uploads/${ids.creatorId}/private/posters/${ids.mediaId}.jpg`))).toEqual(
      Buffer.from("clear-poster"),
    );

    const subscriber = await controller.subscriberVideos(ids.username, token(ids.fanId));
    const locked = subscriber.items.find((item) => item.id === ids.postId);
    expect(subscriber.subscribed).toBe(true);
    expect(locked?.purchased).toBe(false);
    expect(locked?.posterUrl).toBeNull();
    expect(locked?.previewUrl).toContain(`/previews/${ids.mediaId}.jpg`);
    await expect(controller.poster(ids.mediaId, memoryResponse() as never, grant(ids.fanId, "poster"))).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 403,
    );
    await expect(controller.poster(ids.mediaId, memoryResponse() as never)).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 401,
    );

    const buyerView = await controller.subscriberVideos(ids.username, token(ids.buyerId));
    const opened = buyerView.items.find((item) => item.id === ids.postId);
    expect(opened?.purchased).toBe(true);
    expect(opened?.posterUrl?.startsWith(`/v1/media/${ids.mediaId}/poster?token=`)).toBe(true);
    expect(JSON.stringify(buyerView)).not.toContain("private/posters");
    const poster = memoryResponse();
    await controller.poster(ids.mediaId, poster as never, grant(ids.buyerId, "poster"));
    expect(poster.headers.get("cache-control")).toBe("private, no-store");
    expect(poster.body().toString("utf8")).toBe("clear-poster");

    const studio = await controller.list(token(ids.adminId), ids.creatorId);
    const managed = studio.items.find((item) => item.id === ids.postId);
    expect(managed?.previewUrl).toContain(`/media/uploads/${ids.creatorId}/previews/${ids.mediaId}.jpg`);
    expect(managed?.posterUrl).toBeNull();
  });
});
