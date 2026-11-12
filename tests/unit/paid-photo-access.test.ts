import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { loadCreatorGallery } from "../../apps/api/src/modules/creators/gallery";
import { MediaController } from "../../apps/api/src/modules/media/media.module";
import { backfillPaidPreviews } from "../../apps/api/src/modules/media/paid-preview-backfill";
import { signMediaGrant } from "../../apps/api/src/modules/media/signed-url";
import { publicMediaAllowed } from "../../apps/web/lib/public-media";

const { sign } = createRequire(import.meta.url)("../../apps/api/node_modules/jsonwebtoken") as {
  sign: (payload: object, secret: string) => string;
};

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const secret = process.env.JWT_ACCESS_SECRET ?? "local-access-only";
const previousRoot = process.env.MEDIA_ROOT;

type PublicGet = (request: Request, context: { params: Promise<{ path: string[] }> }) => Promise<Response>;

const ids = {
  root: "",
  creatorA: "",
  creatorB: "",
  draftId: "",
  userA: "",
  userB: "",
  draftUser: "",
  subscriberA: "",
  subscriberB: "",
  stranger: "",
  buyer: "",
  packBuyer: "",
  admin: "",
  usernameA: `photoa${suffix}`,
  usernameB: `photob${suffix}`,
  draftName: `photodraft${suffix}`,
  subPost: "",
  subMedia: "",
  freePost: "",
  freeMedia: "",
  ppvPost: "",
  ppvMedia: "",
  videoPost: "",
  videoMedia: "",
  otherPost: "",
  otherMedia: "",
  draftPost: "",
  draftMedia: "",
};

const clearA = labeledJpeg("clear-subscribers");
const blurA = labeledJpeg("blur-subscribers");
const clearFree = labeledJpeg("clear-free");
const clearB = labeledJpeg("clear-other");
const blurB = labeledJpeg("blur-other");
const clearDraft = labeledJpeg("clear-draft");
const blurDraft = labeledJpeg("blur-draft");
const videoPoster = labeledJpeg("clear-video-poster");
const videoPreview = labeledJpeg("blur-video");
const originalA = labeledJpeg("original-subscribers");

function labeledJpeg(label: string) {
  const body = Buffer.alloc(900, 0x20);
  body[0] = 0xff;
  body[1] = 0xd8;
  body[2] = 0xff;
  body.write(label, 40, "utf8");
  return body;
}

function bearer(userId: string) {
  return `Bearer ${sign({ sub: userId }, secret)}`;
}

function grant(mediaId: string, userId: string, kind: "poster" | "preview" | "file" = "poster") {
  return signMediaGrant({ mediaId, userId, exp: Math.floor(Date.now() / 1000) + 120, kind });
}

function statusOf(error: unknown) {
  if (error && typeof error === "object" && "getStatus" in error && typeof error.getStatus === "function") {
    return (error as { getStatus: () => number }).getStatus();
  }
  return 0;
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

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

async function put(key: string, body: Buffer) {
  const absolute = path.join(ids.root, key);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, body);
}

async function creator(username: string, name: string, status: "ACTIVE" | "DRAFT") {
  const user = await database.user.create({
    data: {
      email: `${username}@patrocino.test`,
      passwordHash: "test-only",
      role: "CREATOR",
      profile: { create: { name, username } },
      creator: { create: { status, category: "Lifestyle", defaultVideoPriceCents: 4900 } },
    },
    include: { creator: true },
  });
  return user;
}

async function fan(email: string) {
  return database.user.create({
    data: { email, passwordHash: "test-only", role: "FAN" },
  });
}

async function photoPost(input: {
  creatorId: string;
  caption: string;
  visibility: "SUBSCRIBERS" | "FREE" | "PPV" | "SUBSCRIBER_PPV";
  priceCents?: number;
  poster?: Buffer;
  preview?: Buffer;
  original?: Buffer;
  posterPublic?: boolean;
}) {
  const post = await database.post.create({
    data: {
      creatorId: input.creatorId,
      caption: input.caption,
      visibility: input.visibility,
      priceCents: input.priceCents,
      publishedAt: new Date(Date.now() - 60_000),
      media: {
        create: {
          kind: "IMAGE",
          storageKey: "pending",
          mimeType: "image/jpeg",
          private: input.visibility !== "FREE",
        },
      },
    },
    include: { media: true },
  });
  const media = post.media[0]!;
  const storageKey = `uploads/${input.creatorId}/private/${media.id}.jpg`;
  const posterKey = input.posterPublic === false
    ? `uploads/${input.creatorId}/private/posters/${media.id}.jpg`
    : `uploads/${input.creatorId}/posters/${media.id}.jpg`;
  const previewKey = input.preview ? `uploads/${input.creatorId}/previews/${media.id}.jpg` : null;
  await database.media.update({
    where: { id: media.id },
    data: { storageKey, posterKey, previewKey },
  });
  if (input.original) await put(storageKey, input.original);
  if (input.poster) await put(posterKey, input.poster);
  if (input.preview && previewKey) await put(previewKey, input.preview);
  return { postId: post.id, mediaId: media.id, storageKey, posterKey, previewKey };
}

describe("paid photo paywall", () => {
  let GET: PublicGet;
  let controller: MediaController;

  beforeAll(async () => {
    ids.root = await mkdtemp(path.join(tmpdir(), `paid-photo-${suffix}-`));
    process.env.MEDIA_ROOT = ids.root;
    ({ GET } = await import("../../apps/web/app/media/[...path]/route"));
    controller = new MediaController();

    const ownerA = await creator(ids.usernameA, "Photo A", "ACTIVE");
    const ownerB = await creator(ids.usernameB, "Photo B", "ACTIVE");
    const draft = await creator(ids.draftName, "Draft", "DRAFT");
    ids.userA = ownerA.id;
    ids.userB = ownerB.id;
    ids.draftUser = draft.id;
    ids.creatorA = ownerA.creator!.id;
    ids.creatorB = ownerB.creator!.id;
    ids.draftId = draft.creator!.id;

    const sub = await photoPost({
      creatorId: ids.creatorA,
      caption: "Assinantes",
      visibility: "SUBSCRIBERS",
      poster: clearA,
      preview: blurA,
      original: originalA,
    });
    ids.subPost = sub.postId;
    ids.subMedia = sub.mediaId;
    const free = await photoPost({
      creatorId: ids.creatorA,
      caption: "Teaser",
      visibility: "FREE",
      poster: clearFree,
      original: clearFree,
    });
    ids.freePost = free.postId;
    ids.freeMedia = free.mediaId;

    const ppv = await photoPost({
      creatorId: ids.creatorA,
      caption: "Avulso",
      visibility: "PPV",
      priceCents: 1500,
    });
    ids.ppvPost = ppv.postId;
    ids.ppvMedia = ppv.mediaId;
    const still = path.join(ids.root, ppv.storageKey);
    await mkdir(path.dirname(still), { recursive: true });
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=1:duration=1", "-frames:v", "1", still]);
    await put(ppv.posterKey, await readFile(still));

    const video = await database.post.create({
      data: {
        creatorId: ids.creatorA,
        caption: "clip-secreto.mp4",
        visibility: "SUBSCRIBER_PPV",
        priceCents: 4900,
        publishedAt: new Date(Date.now() - 30_000),
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
    const clip = video.media[0]!;
    ids.videoPost = video.id;
    ids.videoMedia = clip.id;
    const videoPosterKey = `uploads/${ids.creatorA}/private/posters/${clip.id}.jpg`;
    const videoPreviewKey = `uploads/${ids.creatorA}/previews/${clip.id}.jpg`;
    const videoFile = `uploads/${ids.creatorA}/private/${clip.id}.mp4`;
    await database.media.update({
      where: { id: clip.id },
      data: { storageKey: videoFile, posterKey: videoPosterKey, previewKey: videoPreviewKey },
    });
    await put(videoPosterKey, videoPoster);
    await put(videoPreviewKey, videoPreview);
    await put(videoFile, Buffer.from("video-bytes"));

    const other = await photoPost({
      creatorId: ids.creatorB,
      caption: "Outra",
      visibility: "SUBSCRIBERS",
      poster: clearB,
      preview: blurB,
      original: clearB,
    });
    ids.otherPost = other.postId;
    ids.otherMedia = other.mediaId;

    const hidden = await photoPost({
      creatorId: ids.draftId,
      caption: "Rascunho",
      visibility: "SUBSCRIBERS",
      poster: clearDraft,
      preview: blurDraft,
      original: clearDraft,
    });
    ids.draftPost = hidden.postId;
    ids.draftMedia = hidden.mediaId;

    const planA = await database.plan.create({
      data: { creatorId: ids.creatorA, name: "Mensal", description: "Teste", priceCents: 3900, durationMonths: 1, discountPercent: 0, active: true },
    });
    const planB = await database.plan.create({
      data: { creatorId: ids.creatorB, name: "Mensal", description: "Teste", priceCents: 3900, durationMonths: 1, discountPercent: 0, active: true },
    });
    const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const memberA = await fan(`sub-a-${suffix}@patrocino.test`);
    const memberB = await fan(`sub-b-${suffix}@patrocino.test`);
    const stranger = await fan(`stranger-${suffix}@patrocino.test`);
    const buyer = await fan(`buyer-${suffix}@patrocino.test`);
    const packBuyer = await fan(`pack-${suffix}@patrocino.test`);
    const admin = await database.user.create({
      data: { email: `admin-${suffix}@patrocino.test`, passwordHash: "test-only", role: "ADMIN" },
    });
    ids.subscriberA = memberA.id;
    ids.subscriberB = memberB.id;
    ids.stranger = stranger.id;
    ids.buyer = buyer.id;
    ids.packBuyer = packBuyer.id;
    ids.admin = admin.id;
    await database.subscription.create({
      data: {
        fanId: memberA.id,
        creatorId: ids.creatorA,
        planId: planA.id,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: periodEnd,
        currentPeriodEnd: periodEnd,
      },
    });
    await database.subscription.create({
      data: {
        fanId: memberB.id,
        creatorId: ids.creatorB,
        planId: planB.id,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: periodEnd,
        currentPeriodEnd: periodEnd,
      },
    });
    await database.purchase.create({
      data: {
        buyerId: buyer.id,
        creatorId: ids.creatorA,
        postId: ids.ppvPost,
        kind: "POST",
        status: "PAID",
        amountCents: 1500,
        idempotencyKey: `paid-photo-buy-${suffix}`,
      },
    });
    const pack = await database.contentPack.create({
      data: { creatorId: ids.creatorA, name: "Pack", description: "Seleção", priceCents: 2000, active: true },
    });
    await database.contentPackItem.create({ data: { packId: pack.id, postId: ids.ppvPost } });
    await database.purchase.create({
      data: {
        buyerId: packBuyer.id,
        creatorId: ids.creatorA,
        contentPackId: pack.id,
        kind: "PACK",
        status: "PAID",
        amountCents: 2000,
        idempotencyKey: `paid-photo-pack-${suffix}`,
      },
    });
  });

  afterAll(async () => {
    if (previousRoot === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = previousRoot;
    if (ids.root) await rm(ids.root, { recursive: true, force: true });
    const creatorIds = [ids.creatorA, ids.creatorB, ids.draftId].filter(Boolean);
    const userIds = [ids.userA, ids.userB, ids.draftUser, ids.subscriberA, ids.subscriberB, ids.stranger, ids.buyer, ids.packBuyer, ids.admin].filter(Boolean);
    if (creatorIds.length) {
      await database.purchase.deleteMany({ where: { creatorId: { in: creatorIds } } });
      await database.contentPackItem.deleteMany({ where: { pack: { creatorId: { in: creatorIds } } } });
      await database.contentPack.deleteMany({ where: { creatorId: { in: creatorIds } } });
      await database.subscription.deleteMany({ where: { creatorId: { in: creatorIds } } });
      await database.plan.deleteMany({ where: { creatorId: { in: creatorIds } } });
      await database.media.deleteMany({ where: { post: { creatorId: { in: creatorIds } } } });
      await database.post.deleteMany({ where: { creatorId: { in: creatorIds } } });
      await database.creator.deleteMany({ where: { id: { in: creatorIds } } });
    }
    if (userIds.length) {
      await database.profile.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  async function fetchPublic(parts: string[]) {
    const response = await GET(new Request(`http://127.0.0.1/media/${parts.join("/")}`), {
      params: Promise.resolve({ path: parts }),
    });
    return {
      status: response.status,
      cache: response.headers.get("cache-control"),
      type: response.headers.get("content-type"),
      body: Buffer.from(await response.arrayBuffer()),
    };
  }

  function imageOf(page: Awaited<ReturnType<typeof loadCreatorGallery>>, postId: string) {
    const item = page?.items.find((entry) => entry.kind === "post" && entry.post.id === postId);
    return item && item.kind === "post" ? item.post.image : "";
  }

  it("leaves the clear files in place on a dry run", async () => {
    const report = await backfillPaidPreviews({ creatorId: ids.creatorA });
    expect(report.apply).toBe(false);
    expect(report.failed).toEqual([]);
    expect(report.previewsWritten).toBe(1);
    expect(report.postersMoved).toBe(2);
    expect(await readFile(path.join(ids.root, `uploads/${ids.creatorA}/posters/${ids.subMedia}.jpg`))).toEqual(clearA);
  });

  it("serves a blurred preview to guests and the clear photo only to entitled viewers", async () => {
    const reports = await Promise.all([
      backfillPaidPreviews({ apply: true, creatorId: ids.creatorA }),
      backfillPaidPreviews({ apply: true, creatorId: ids.creatorB }),
      backfillPaidPreviews({ apply: true, creatorId: ids.draftId }),
    ]);
    expect(reports.flatMap((item) => item.failed)).toEqual([]);
    const saved = await database.media.findUniqueOrThrow({ where: { id: ids.subMedia } });
    expect(saved.posterKey).toBe(`uploads/${ids.creatorA}/private/posters/${ids.subMedia}.jpg`);
    expect(saved.previewKey).toBe(`uploads/${ids.creatorA}/previews/${ids.subMedia}.jpg`);
    expect(await readFile(path.join(ids.root, saved.posterKey!))).toEqual(clearA);
    expect(await readFile(path.join(ids.root, saved.previewKey!))).toEqual(blurA);
    await expect(readFile(path.join(ids.root, `uploads/${ids.creatorA}/posters/${ids.subMedia}.jpg`))).rejects.toThrow();

    const other = await database.media.findUniqueOrThrow({ where: { id: ids.otherMedia } });
    expect(other.posterKey).toBe(`uploads/${ids.creatorB}/private/posters/${ids.otherMedia}.jpg`);
    expect(await readFile(path.join(ids.root, other.posterKey!))).toEqual(clearB);
    await expect(readFile(path.join(ids.root, `uploads/${ids.creatorB}/posters/${ids.otherMedia}.jpg`))).rejects.toThrow();

    const draft = await database.media.findUniqueOrThrow({ where: { id: ids.draftMedia } });
    expect(draft.posterKey).toContain("/private/posters/");
    expect(draft.previewKey).toContain("/private/previews/");
    await expect(readFile(path.join(ids.root, `uploads/${ids.draftId}/posters/${ids.draftMedia}.jpg`))).rejects.toThrow();
    await expect(readFile(path.join(ids.root, `uploads/${ids.draftId}/previews/${ids.draftMedia}.jpg`))).rejects.toThrow();

    const free = await database.media.findUniqueOrThrow({ where: { id: ids.freeMedia } });
    expect(free.posterKey).toBe(`uploads/${ids.creatorA}/posters/${ids.freeMedia}.jpg`);
    expect(await readFile(path.join(ids.root, free.posterKey!))).toEqual(clearFree);

    const ppv = await database.media.findUniqueOrThrow({ where: { id: ids.ppvMedia } });
    expect(ppv.posterKey).toBe(`uploads/${ids.creatorA}/private/posters/${ids.ppvMedia}.jpg`);
    expect(ppv.previewKey).toBe(`uploads/${ids.creatorA}/previews/${ids.ppvMedia}.jpg`);
    const ppvPoster = await readFile(path.join(ids.root, ppv.posterKey!));
    const ppvPreview = await readFile(path.join(ids.root, ppv.previewKey!));
    expect(ppvPoster[0]).toBe(0xff);
    expect(ppvPreview[0]).toBe(0xff);
    expect(ppvPreview.equals(ppvPoster)).toBe(false);
    await expect(readFile(path.join(ids.root, `uploads/${ids.creatorA}/posters/${ids.ppvMedia}.jpg`))).rejects.toThrow();

    const clip = await database.media.findUniqueOrThrow({ where: { id: ids.videoMedia } });
    expect(clip.posterKey).toBe(`uploads/${ids.creatorA}/private/posters/${ids.videoMedia}.jpg`);
    expect(clip.previewKey).toBe(`uploads/${ids.creatorA}/previews/${ids.videoMedia}.jpg`);
    expect(await readFile(path.join(ids.root, clip.posterKey!))).toEqual(videoPoster);
    expect(await readFile(path.join(ids.root, clip.previewKey!))).toEqual(videoPreview);

    const leaked = await fetchPublic(["uploads", ids.creatorA, "posters", `${ids.subMedia}.jpg`]);
    expect(leaked.status).toBe(404);
    expect(leaked.cache).toBe("no-store");
    expect(leaked.body.length).toBe(0);
    const privateUrl = await fetchPublic(["uploads", ids.creatorA, "private", "posters", `${ids.subMedia}.jpg`]);
    expect(privateUrl.status).toBe(404);
    expect(publicMediaAllowed(["uploads", ids.creatorA, "private", "posters", `${ids.subMedia}.jpg`])).toBe(false);
    const preview = await fetchPublic(["uploads", ids.creatorA, "previews", `${ids.subMedia}.jpg`]);
    expect(preview.status).toBe(200);
    expect(preview.type).toBe("image/jpeg");
    expect(preview.body).toEqual(blurA);
    expect(preview.body.equals(clearA)).toBe(false);
    const otherPreview = await fetchPublic(["uploads", ids.creatorB, "previews", `${ids.otherMedia}.jpg`]);
    expect(otherPreview.status).toBe(200);
    expect(otherPreview.body).toEqual(blurB);
    const otherPoster = await fetchPublic(["uploads", ids.creatorB, "posters", `${ids.otherMedia}.jpg`]);
    expect(otherPoster.status).toBe(404);
    const freeFetch = await fetchPublic(["uploads", ids.creatorA, "posters", `${ids.freeMedia}.jpg`]);
    expect(freeFetch.status).toBe(200);
    expect(freeFetch.type).toBe("image/jpeg");
    expect(freeFetch.body).toEqual(clearFree);
    const ppvFetch = await fetchPublic(["uploads", ids.creatorA, "previews", `${ids.ppvMedia}.jpg`]);
    expect(ppvFetch.status).toBe(200);
    expect(ppvFetch.body.equals(ppvPoster)).toBe(false);
    const draftFetch = await fetchPublic(["uploads", ids.draftId, "previews", `${ids.draftMedia}.jpg`]);
    expect(draftFetch.status).toBe(404);

    expect(await loadCreatorGallery({ key: ids.draftName, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL" })).toBeNull();

    const guest = await loadCreatorGallery({ key: ids.usernameA, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL" });
    expect(imageOf(guest, ids.subPost)).toBe(`/media/uploads/${ids.creatorA}/previews/${ids.subMedia}.jpg`);
    expect(imageOf(guest, ids.freePost)).toBe(`/media/uploads/${ids.creatorA}/posters/${ids.freeMedia}.jpg`);
    expect(imageOf(guest, ids.ppvPost)).toBe(`/media/uploads/${ids.creatorA}/previews/${ids.ppvMedia}.jpg`);
    expect(JSON.stringify(guest)).not.toContain("/posters/" + ids.subMedia);
    expect(JSON.stringify(guest)).not.toContain("/private/");
    const guestVideo = guest?.items.find((entry) => entry.kind === "video" && entry.video.id === ids.videoPost);
    expect(guestVideo && guestVideo.kind === "video" ? guestVideo.video.previewUrl : "").toContain(`/previews/${ids.videoMedia}.jpg`);
    expect(guestVideo && guestVideo.kind === "video" ? guestVideo.video.posterUrl : "missing").toBeNull();
    expect(guestVideo && guestVideo.kind === "video" ? guestVideo.video.caption : "").toContain("Vídeo exclusivo #");

    const stranger = await loadCreatorGallery({ key: ids.usernameA, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL", viewerId: ids.stranger });
    expect(imageOf(stranger, ids.subPost)).toContain(`/previews/${ids.subMedia}.jpg`);
    expect(imageOf(stranger, ids.ppvPost)).toContain(`/previews/${ids.ppvMedia}.jpg`);

    const member = await loadCreatorGallery({ key: ids.usernameA, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL", viewerId: ids.subscriberA });
    const memberImage = imageOf(member, ids.subPost);
    expect(memberImage.startsWith(`/v1/media/${ids.subMedia}/poster?token=`)).toBe(true);
    expect(imageOf(member, ids.ppvPost)).toContain(`/previews/${ids.ppvMedia}.jpg`);
    expect(imageOf(member, ids.freePost)).toContain(`/posters/${ids.freeMedia}.jpg`);
    expect(JSON.stringify(member)).not.toContain("/private/");

    const memberPoster = memoryResponse();
    await controller.poster(ids.subMedia, memberPoster as never, grant(ids.subMedia, ids.subscriberA));
    expect(memberPoster.headers.get("cache-control")).toBe("private, no-store");
    expect(memberPoster.headers.get("cdn-cache-control")).toBe("no-store");
    expect(memberPoster.headers.get("cache-control")).not.toContain("public");
    expect(memberPoster.body()).toEqual(clearA);

    const anonymousPoster = memoryResponse();
    await expect(controller.poster(ids.subMedia, anonymousPoster as never)).rejects.toSatisfy((error: unknown) => statusOf(error) === 401);
    expect(anonymousPoster.headers.get("cache-control")).toBe("private, no-store");
    await expect(controller.poster(ids.subMedia, memoryResponse() as never, grant(ids.subMedia, ids.stranger))).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 403,
    );
    await expect(controller.poster(ids.subMedia, memoryResponse() as never, grant(ids.subMedia, ids.subscriberB))).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 403,
    );
    await expect(controller.file(ids.subMedia, undefined, undefined, memoryResponse() as never)).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 401,
    );

    const access = await controller.access(ids.subMedia, bearer(ids.subscriberA));
    const fileToken = new URL(access.url, "http://127.0.0.1").searchParams.get("token");
    const original = memoryResponse();
    await controller.file(ids.subMedia, undefined, undefined, original as never, fileToken ?? undefined);
    expect(original.headers.get("cache-control")).toBe("private, no-store");
    expect(original.body()).toEqual(originalA);
    await expect(controller.access(ids.subMedia, undefined)).rejects.toSatisfy((error: unknown) => statusOf(error) === 401);

    const adminPoster = memoryResponse();
    await controller.poster(ids.subMedia, adminPoster as never, grant(ids.subMedia, ids.admin));
    expect(adminPoster.body()).toEqual(clearA);
    const ownerPage = await loadCreatorGallery({ key: ids.usernameA, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL", viewerId: ids.userA });
    expect(imageOf(ownerPage, ids.subPost).startsWith(`/v1/media/${ids.subMedia}/poster?token=`)).toBe(true);

    const buyerPage = await loadCreatorGallery({ key: ids.usernameA, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL", viewerId: ids.buyer });
    expect(imageOf(buyerPage, ids.ppvPost).startsWith(`/v1/media/${ids.ppvMedia}/poster?token=`)).toBe(true);
    expect(imageOf(buyerPage, ids.subPost)).toContain(`/previews/${ids.subMedia}.jpg`);
    const bought = memoryResponse();
    await controller.poster(ids.ppvMedia, bought as never, grant(ids.ppvMedia, ids.buyer));
    expect(bought.headers.get("cache-control")).toBe("private, no-store");
    expect(bought.body()).toEqual(ppvPoster);

    const packed = await loadCreatorGallery({ key: ids.usernameA, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL", viewerId: ids.packBuyer });
    expect(imageOf(packed, ids.ppvPost).startsWith(`/v1/media/${ids.ppvMedia}/poster?token=`)).toBe(true);
    expect(imageOf(packed, ids.subPost)).toContain(`/previews/${ids.subMedia}.jpg`);

    const otherGuest = await loadCreatorGallery({ key: ids.usernameB, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL" });
    expect(imageOf(otherGuest, ids.otherPost)).toBe(`/media/uploads/${ids.creatorB}/previews/${ids.otherMedia}.jpg`);
    const otherMember = await loadCreatorGallery({ key: ids.usernameB, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL", viewerId: ids.subscriberB });
    expect(imageOf(otherMember, ids.otherPost).startsWith(`/v1/media/${ids.otherMedia}/poster?token=`)).toBe(true);
    const crossed = await loadCreatorGallery({ key: ids.usernameA, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL", viewerId: ids.subscriberB });
    expect(imageOf(crossed, ids.subPost)).toContain(`/previews/${ids.subMedia}.jpg`);

    const previewStat = await stat(path.join(ids.root, `uploads/${ids.creatorA}/previews/${ids.subMedia}.jpg`));
    const again = await backfillPaidPreviews({ apply: true, creatorId: ids.creatorA });
    expect(again.failed).toEqual([]);
    expect(again.previewsWritten).toBe(0);
    expect(again.postersMoved).toBe(0);
    const previewAgain = await stat(path.join(ids.root, `uploads/${ids.creatorA}/previews/${ids.subMedia}.jpg`));
    expect(previewAgain.mtimeMs).toBe(previewStat.mtimeMs);

    await database.post.update({ where: { id: ids.subPost }, data: { visibility: "FREE" } });
    const unlocked = await backfillPaidPreviews({ apply: true, creatorId: ids.creatorA });
    expect(unlocked.failed).toEqual([]);
    expect(unlocked.postersMoved).toBe(1);
    const teaser = await database.media.findUniqueOrThrow({ where: { id: ids.subMedia } });
    expect(teaser.posterKey).toBe(`uploads/${ids.creatorA}/posters/${ids.subMedia}.jpg`);
    expect(await readFile(path.join(ids.root, teaser.posterKey!))).toEqual(clearA);
    const teaserFetch = await fetchPublic(["uploads", ids.creatorA, "posters", `${ids.subMedia}.jpg`]);
    expect(teaserFetch.status).toBe(200);
    expect(teaserFetch.body).toEqual(clearA);
    const teaserPage = await loadCreatorGallery({ key: ids.usernameA, tab: "media", offset: 0, limit: 36, seed: "paywall", currency: "BRL" });
    expect(imageOf(teaserPage, ids.subPost)).toBe(`/media/uploads/${ids.creatorA}/posters/${ids.subMedia}.jpg`);
    const stillPaid = await fetchPublic(["uploads", ids.creatorA, "posters", `${ids.ppvMedia}.jpg`]);
    expect(stillPaid.status).toBe(404);
  });
});
