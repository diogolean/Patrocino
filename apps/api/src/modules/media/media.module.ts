import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Prisma, database } from "@mimelux/db/runtime";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { z } from "zod";
import { optionalUser, requireUser } from "../auth/require-user";
import { writePosterAndPreview } from "./derivatives";
import { fanSubscribed, paidPostPurchase, resolveVideoPrice, viewerCanReadPost } from "./entitlement";
import { MEDIA_GRANT_TTL_SECONDS, readMediaGrant, signMediaGrant } from "./signed-url";
import { chunkSizeBytes, declaredMimeMatches, detectFile, maxBytes } from "./sniff";
import { assembleChunks, openStorage, receivedChunkIndexes, type DiskStorage } from "./storage";

const visibilitySchema = z.enum(["free", "subscribers", "ppv", "subscriber_ppv"]);

const startSchema = z.object({
  creatorId: z.string().min(1).optional(),
  filename: z.string().min(1).max(180),
  mimeType: z.string().min(1).max(120).default("application/octet-stream"),
  byteSize: z.number().int().positive(),
  chunkSize: z.number().int().positive().max(chunkSizeBytes).optional(),
});

const completeSchema = z.object({
  caption: z.string().min(1).max(500).optional(),
  visibility: visibilitySchema.default("subscribers"),
  priceCents: z.number().int().positive().nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
});

const patchSchema = z.object({
  caption: z.string().min(1).max(500).optional(),
  visibility: visibilitySchema.optional(),
  priceCents: z.number().int().positive().nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
});

const orderSchema = z.object({
  creatorId: z.string().min(1).optional(),
  ids: z.array(z.string().min(1)).min(1),
});

const videoPriceSchema = z.object({
  creatorId: z.string().min(1).optional(),
  defaultVideoPriceCents: z.number().int().positive().max(10_000_000),
});

type Manager = {
  user: { id: string; role: string };
  creator: { id: string; userId: string; defaultVideoPriceCents: number };
  admin: boolean;
};

function safeFilename(name: string) {
  return name.split(/[/\\]/).pop()?.replace(/[^\w.\- ]+/g, "").slice(0, 180) || "arquivo";
}

function toVisibility(value: z.infer<typeof visibilitySchema>) {
  if (value === "free") return "FREE" as const;
  if (value === "ppv") return "PPV" as const;
  if (value === "subscriber_ppv") return "SUBSCRIBER_PPV" as const;
  return "SUBSCRIBERS" as const;
}

function fromVisibility(value: string) {
  if (value === "FREE") return "free";
  if (value === "PPV") return "ppv";
  if (value === "SUBSCRIBER_PPV") return "subscriber_ppv";
  return "subscribers";
}

function isLocked(visibility: string) {
  return visibility !== "FREE";
}

function pipeStream(stream: ReadStream, response: Response) {
  return new Promise<void>((resolve, reject) => {
    stream.on("error", reject);
    response.on("error", reject);
    response.on("finish", resolve);
    stream.pipe(response);
  });
}

async function readLimited(req: Request, limit: number) {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (req.readableEnded) {
    const body = Buffer.isBuffer(raw) ? raw : Buffer.alloc(0);
    if (body.length > limit) throw new PayloadTooLargeException("Chunk is too large");
    return body;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new PayloadTooLargeException("Chunk is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function audit(actorId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  await database.auditLog.create({
    data: {
      actorId,
      action,
      entityType: "post",
      entityId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

@ApiTags("media")
@ApiBearerAuth()
@Controller()
export class MediaController {
  private storagePromise: Promise<DiskStorage> | null = null;

  private storage() {
    this.storagePromise ??= openStorage();
    return this.storagePromise;
  }

  private async manager(authorization: string | undefined, creatorId?: string): Promise<Manager> {
    const user = await requireUser(authorization);
    if (user.role === "ADMIN") {
      if (!creatorId) throw new BadRequestException("creatorId is required");
      const creator = await database.creator.findUnique({ where: { id: creatorId } });
      if (!creator) throw new BadRequestException("Creator not found");
      return { user, creator, admin: true };
    }
    if (user.role !== "CREATOR") throw new ForbiddenException("Creator only");
    let creator = await database.creator.findUnique({ where: { userId: user.id } });
    if (!creator) {
      creator = await database.creator.create({
        data: { userId: user.id, status: "ACTIVE", category: "Geral", ownership: "HOUSE" },
      });
    }
    if (creatorId && creatorId !== creator.id) throw new ForbiddenException("Creator only");
    return { user, creator, admin: false };
  }

  @Get("media/items")
  async list(
    @Headers("authorization") authorization: string | undefined,
    @Query("creatorId") creatorId?: string,
  ) {
    const actor = await this.manager(authorization, creatorId);
    const posts = await database.post.findMany({
      where: { creatorId: actor.creator.id, deletedAt: null, media: { some: {} } },
      include: { media: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return {
      items: posts.map((post) => this.present(post, true)),
      defaultVideoPriceCents: actor.creator.defaultVideoPriceCents,
    };
  }

  @Patch("media/video-price")
  async videoPrice(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const parsed = videoPriceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
    const actor = await this.manager(authorization, parsed.data.creatorId);
    const creator = await database.creator.update({
      where: { id: actor.creator.id },
      data: { defaultVideoPriceCents: parsed.data.defaultVideoPriceCents },
    });
    if (actor.admin) {
      await database.auditLog.create({
        data: {
          actorId: actor.user.id,
          action: "media.default_video_price",
          entityType: "creator",
          entityId: creator.id,
          metadata: { defaultVideoPriceCents: creator.defaultVideoPriceCents },
        },
      });
    }
    return { defaultVideoPriceCents: creator.defaultVideoPriceCents };
  }

  @Get("creators/:key/subscriber-videos")
  async subscriberVideos(@Param("key") key: string, @Headers("authorization") authorization?: string) {
    const viewer = await optionalUser(authorization);
    const keys = Array.from(new Set([key, key.replace(/-/g, "")]));
    const creator = await database.creator.findFirst({
      where: {
        status: "ACTIVE",
        OR: [{ id: { in: keys } }, { user: { profile: { is: { username: { in: keys } } } } }],
      },
    });
    if (!creator) return { items: [], subscribed: false, viewerHandle: null };
    const subscribed = viewer ? await fanSubscribed(viewer.id, creator.id) : false;
    const posts = await database.post.findMany({
      where: {
        creatorId: creator.id,
        visibility: "SUBSCRIBER_PPV",
        deletedAt: null,
        publishedAt: { lte: new Date() },
        media: { some: { kind: "VIDEO" } },
      },
      include: { media: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ publishedAt: "desc" }, { sortOrder: "asc" }],
    });
    const items = [];
    for (const post of posts) {
      const media = post.media.find((item) => item.kind === "VIDEO") ?? post.media[0];
      if (!media || media.storageKey === "pending") continue;
      const purchased = viewer ? await paidPostPurchase(viewer.id, post.id) : false;
      items.push({
        id: post.id,
        mediaId: media.id,
        caption: post.caption,
        priceCents: post.priceCents ?? creator.defaultVideoPriceCents,
        previewUrl: media.previewKey ? `/media/${media.previewKey}` : null,
        fileUrl: null,
        durationMs: media.durationMs,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        purchased,
        subscribed,
      });
    }
    return { items, subscribed, viewerHandle: viewer ? await this.viewerHandle(viewer.id) : null };
  }

  @Post("media/uploads")
  async start(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
    const actor = await this.manager(authorization, parsed.data.creatorId);
    const chunkSize = Math.min(parsed.data.chunkSize ?? chunkSizeBytes, chunkSizeBytes);
    const totalChunks = Math.ceil(parsed.data.byteSize / chunkSize);
    if (totalChunks > 500) throw new BadRequestException("File needs fewer, larger chunks");
    const storage = await this.storage();
    const upload = await database.mediaUpload.create({
      data: {
        creatorId: actor.creator.id,
        actorId: actor.user.id,
        filename: safeFilename(parsed.data.filename),
        mimeType: parsed.data.mimeType,
        byteSize: parsed.data.byteSize,
        chunkSize,
        totalChunks,
        tempDir: "pending",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const tempDir = `uploads/${actor.creator.id}/tmp/${upload.id}`;
    await mkdir(storage.resolve(tempDir), { recursive: true });
    const saved = await database.mediaUpload.update({ where: { id: upload.id }, data: { tempDir } });
    return {
      id: saved.id,
      chunkSize: saved.chunkSize,
      totalChunks: saved.totalChunks,
      received: [],
    };
  }

  @Get("media/uploads/:id")
  async status(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const upload = await this.ownedUpload(authorization, id);
    const storage = await this.storage();
    return {
      id: upload.id,
      chunkSize: upload.chunkSize,
      received: await receivedChunkIndexes(storage.resolve(upload.tempDir)),
      totalChunks: upload.totalChunks,
      status: upload.status,
    };
  }

  @Put("media/uploads/:id/chunks/:index")
  async chunk(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Param("index") indexRaw: string,
    @Req() request: Request,
  ) {
    const upload = await this.ownedUpload(authorization, id);
    if (upload.status !== "open") throw new BadRequestException("Upload is already finished");
    const index = Number(indexRaw);
    if (!Number.isInteger(index) || index < 0 || index >= upload.totalChunks) {
      throw new BadRequestException("Chunk index is out of range");
    }
    const expected =
      index === upload.totalChunks - 1
        ? upload.byteSize - upload.chunkSize * (upload.totalChunks - 1)
        : upload.chunkSize;
    const body = await readLimited(request, expected);
    if (body.length !== expected) throw new BadRequestException("Chunk size does not match");
    if (index === 0) {
      const detected = detectFile(body.subarray(0, 64));
      if (!detected) throw new BadRequestException("File type is not allowed");
      if (!declaredMimeMatches(upload.mimeType, detected)) throw new BadRequestException("File type does not match");
      if (upload.byteSize > maxBytes(detected.kind)) throw new PayloadTooLargeException("File is too large");
    }
    const storage = await this.storage();
    const directory = storage.resolve(upload.tempDir);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${index}.part`), body);
    return { received: true, index };
  }

  @Post("media/uploads/:id/complete")
  async complete(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const upload = await this.ownedUpload(authorization, id);
    if (upload.status !== "open") throw new BadRequestException("Upload is already finished");
    const parsed = completeSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
    const visibility = toVisibility(parsed.data.visibility);
    const creator = await database.creator.findUniqueOrThrow({ where: { id: upload.creatorId } });
    const priceCents = resolveVideoPrice({
      visibility,
      explicitCents: parsed.data.priceCents,
      defaultVideoPriceCents: creator.defaultVideoPriceCents,
    });
    if ((visibility === "PPV" || visibility === "SUBSCRIBER_PPV") && !priceCents) {
      throw new BadRequestException("PPV price is required");
    }
    const storage = await this.storage();
    const directory = storage.resolve(upload.tempDir);
    const received = await receivedChunkIndexes(directory);
    if (received.length !== upload.totalChunks) throw new BadRequestException("Upload is incomplete");
    const assembled = path.join(directory, "assembled");
    await assembleChunks(directory, upload.totalChunks, assembled);
    const info = await stat(assembled);
    if (info.size !== upload.byteSize) throw new BadRequestException("Uploaded size does not match");
    const handle = await open(assembled, "r");
    const sample = Buffer.alloc(64);
    await handle.read(sample, 0, 64, 0);
    await handle.close();
    const detected = detectFile(sample);
    if (!detected || !declaredMimeMatches(upload.mimeType, detected)) {
      throw new BadRequestException("File type is not allowed");
    }
    if (info.size > maxBytes(detected.kind)) throw new PayloadTooLargeException("File is too large");
    const locked = isLocked(visibility);
    const post = await database.post.create({
      data: {
        creatorId: upload.creatorId,
        caption: parsed.data.caption?.trim() || upload.filename,
        visibility,
        priceCents,
        publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : new Date(),
        sortOrder: await this.nextSort(upload.creatorId),
      },
    });
    const media = await database.media.create({
      data: {
        postId: post.id,
        kind: detected.kind,
        storageKey: "pending",
        mimeType: detected.mimeType,
        byteSize: info.size,
        private: locked,
      },
    });
    const folder = locked ? "private" : "public";
    const storageKey = `uploads/${upload.creatorId}/${folder}/${media.id}.${detected.extension}`;
    const posterKey =
      visibility === "SUBSCRIBER_PPV"
        ? `uploads/${upload.creatorId}/private/posters/${media.id}.jpg`
        : `uploads/${upload.creatorId}/posters/${media.id}.jpg`;
    const previewKey = `uploads/${upload.creatorId}/previews/${media.id}.jpg`;
    const destination = storage.resolve(storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(assembled, destination);
    await writePosterAndPreview(storage.resolve(storageKey), storage.resolve(posterKey), storage.resolve(previewKey), detected.kind === "VIDEO");
    await rm(directory, { recursive: true, force: true });
    const saved = await database.media.update({
      where: { id: media.id },
      data: { storageKey, posterKey, previewKey, private: locked },
    });
    await database.mediaUpload.update({ where: { id: upload.id }, data: { status: "complete" } });
    const full = await database.post.findUniqueOrThrow({ where: { id: post.id }, include: { media: true } });
    if (upload.actorId) {
      const actor = await database.user.findUnique({ where: { id: upload.actorId } });
      if (actor?.role === "ADMIN") {
        await audit(actor.id, "media.upload", post.id, { creatorId: upload.creatorId, mediaId: saved.id, visibility });
      }
    }
    return { item: this.present(full, true) };
  }

  @Patch("media/items/order")
  @HttpCode(200)
  async reorder(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
    const actor = await this.manager(authorization, parsed.data.creatorId);
    const posts = await database.post.findMany({
      where: { id: { in: parsed.data.ids }, deletedAt: null },
      select: { id: true, creatorId: true },
    });
    if (posts.some((post) => post.creatorId !== actor.creator.id)) throw new ForbiddenException("Creator only");
    if (posts.length !== parsed.data.ids.length) throw new BadRequestException("Unknown media item");
    await database.$transaction(
      parsed.data.ids.map((id, index) => database.post.update({ where: { id }, data: { sortOrder: index } })),
    );
    if (actor.admin) await audit(actor.user.id, "media.reorder", actor.creator.id, { ids: parsed.data.ids });
    return { ok: true };
  }

  @Patch("media/items/:id")
  async update(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
    const post = await database.post.findUnique({ where: { id }, include: { media: true } });
    if (!post || post.deletedAt) throw new NotFoundException("Media not found");
    const actor = await this.manager(authorization, post.creatorId);
    const visibility = parsed.data.visibility ? toVisibility(parsed.data.visibility) : post.visibility;
    const creator = await database.creator.findUniqueOrThrow({ where: { id: post.creatorId } });
    const explicit =
      parsed.data.priceCents !== undefined ? parsed.data.priceCents : visibility === "FREE" || visibility === "SUBSCRIBERS" ? null : post.priceCents;
    const priceCents = resolveVideoPrice({
      visibility,
      explicitCents: explicit,
      defaultVideoPriceCents: creator.defaultVideoPriceCents,
    });
    if ((visibility === "PPV" || visibility === "SUBSCRIBER_PPV") && !priceCents) {
      throw new BadRequestException("PPV price is required");
    }
    const locked = isLocked(visibility);
    const storage = await this.storage();
    for (const media of post.media) {
      if (media.private === locked || media.storageKey === "pending") continue;
      const nextKey = this.relocateKey(media.storageKey, locked);
      if (nextKey !== media.storageKey && (await storage.exists(media.storageKey))) {
        const destination = storage.resolve(nextKey);
        await mkdir(path.dirname(destination), { recursive: true });
        await rename(storage.resolve(media.storageKey), destination);
      }
      await database.media.update({ where: { id: media.id }, data: { storageKey: nextKey, private: locked } });
    }
    await database.post.update({
      where: { id: post.id },
      data: {
        caption: parsed.data.caption ?? post.caption,
        visibility,
        priceCents,
        publishedAt:
          parsed.data.publishedAt === undefined
            ? post.publishedAt
            : parsed.data.publishedAt
              ? new Date(parsed.data.publishedAt)
              : null,
      },
    });
    if (actor.admin) {
      await audit(actor.user.id, "media.update", post.id, { creatorId: post.creatorId, visibility });
    }
    const full = await database.post.findUniqueOrThrow({ where: { id: post.id }, include: { media: true } });
    return { item: this.present(full, true) };
  }

  @Delete("media/items/:id")
  @HttpCode(200)
  async remove(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const post = await database.post.findUnique({ where: { id } });
    if (!post || post.deletedAt) throw new NotFoundException("Media not found");
    const actor = await this.manager(authorization, post.creatorId);
    await database.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
    if (actor.admin) await audit(actor.user.id, "media.delete", post.id, { creatorId: post.creatorId });
    return { deleted: true };
  }

  @Get("media/:id/access")
  async access(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const user = await requireUser(authorization);
    const media = await database.media.findUnique({ where: { id }, include: { post: true } });
    if (!media?.post || media.post.deletedAt || media.storageKey === "pending") throw new NotFoundException("Media not found");
    const allowed = await this.canRead(authorization, media.post);
    if (!allowed) {
      throw new ForbiddenException(media.post.visibility === "SUBSCRIBER_PPV" ? "Purchase required" : "Subscription required");
    }
    const exp = Math.floor(Date.now() / 1000) + MEDIA_GRANT_TTL_SECONDS;
    const token = signMediaGrant({ mediaId: media.id, userId: user.id, exp, kind: "file" });
    return {
      url: `/v1/media/${media.id}/file?token=${encodeURIComponent(token)}`,
      expiresAt: new Date(exp * 1000).toISOString(),
      handle: await this.viewerHandle(user.id),
    };
  }

  @Get("media/:id/file")
  async file(
    @Param("id") id: string,
    @Headers("authorization") authorization: string | undefined,
    @Headers("range") range: string | undefined,
    @Res() response: Response,
    @Query("token") token?: string,
  ) {
    const media = await database.media.findUnique({ where: { id }, include: { post: true } });
    if (!media?.post || media.post.deletedAt || media.storageKey === "pending") throw new NotFoundException("Media not found");
    if (token) {
      const grant = readMediaGrant(token);
      if (!grant || grant.mediaId !== id) throw new UnauthorizedException("Media link expired");
      const user = await database.user.findUnique({ where: { id: grant.userId } });
      if (!user || user.deletedAt || user.suspendedAt) throw new UnauthorizedException("Media link expired");
      const owner = await database.creator.findUnique({ where: { userId: user.id } });
      const allowed = await viewerCanReadPost({
        user,
        owns: owner?.id === media.post.creatorId,
        post: media.post,
      });
      if (!allowed) {
        throw new ForbiddenException(media.post.visibility === "SUBSCRIBER_PPV" ? "Purchase required" : "Subscription required");
      }
    } else {
      const allowed = await this.canRead(authorization, media.post);
      if (!allowed) {
        if (!authorization) throw new UnauthorizedException("Missing access token");
        throw new ForbiddenException(media.post.visibility === "SUBSCRIBER_PPV" ? "Purchase required" : "Subscription required");
      }
      const user = authorization ? await requireUser(authorization) : null;
      const owner = user ? await database.creator.findUnique({ where: { userId: user.id } }) : null;
      if (user?.role !== "ADMIN" && owner?.id !== media.post.creatorId && media.post.visibility !== "FREE") {
        throw new UnauthorizedException("Media link expired");
      }
    }
    const storage = await this.storage();
    if (!(await storage.exists(media.storageKey))) throw new NotFoundException("Media not found");
    const size = await storage.size(media.storageKey);
    const absolute = storage.resolve(media.storageKey);
    response.setHeader("Content-Type", media.mimeType);
    response.setHeader("Content-Disposition", "inline");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", token || media.private ? "private, no-store" : "private, max-age=3600");
    response.setHeader("Accept-Ranges", "bytes");
    const match = range?.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      response.setHeader("Content-Length", String(size));
      await pipeStream(createReadStream(absolute), response);
      return;
    }
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      response.status(416).end();
      return;
    }
    response.status(206);
    response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    response.setHeader("Content-Length", String(end - start + 1));
    await pipeStream(createReadStream(absolute, { start, end }), response);
  }

  private async viewerHandle(userId: string) {
    const profile = await database.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { username: true } } },
    });
    return profile?.profile?.username ?? null;
  }

  private async canRead(
    authorization: string | undefined,
    post: { creatorId: string; visibility: string; deletedAt: Date | null; publishedAt: Date | null; id: string },
  ) {
    let user: { id: string; role: string } | null = null;
    if (authorization) {
      try {
        user = await requireUser(authorization);
      } catch {
        user = null;
      }
    }
    const owner = user ? await database.creator.findUnique({ where: { userId: user.id } }) : null;
    return viewerCanReadPost({ user, owns: owner?.id === post.creatorId, post });
  }

  private async ownedUpload(authorization: string | undefined, id: string) {
    const upload = await database.mediaUpload.findUnique({ where: { id } });
    if (!upload || upload.expiresAt.getTime() < Date.now()) throw new NotFoundException("Upload not found");
    await this.manager(authorization, upload.creatorId);
    return upload;
  }

  private async nextSort(creatorId: string) {
    const last = await database.post.findFirst({
      where: { creatorId, deletedAt: null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? 0) + 1;
  }

  private relocateKey(key: string, locked: boolean) {
    return key.replace(/\/(public|private)\//, locked ? "/private/" : "/public/");
  }

  private present(
    post: {
      id: string;
      creatorId: string;
      caption: string;
      visibility: string;
      priceCents: number | null;
      publishedAt: Date | null;
      sortOrder: number;
      media: {
        id: string;
        kind: string;
        mimeType: string;
        posterKey: string | null;
        previewKey: string | null;
        byteSize: number | null;
        private: boolean;
        durationMs: number | null;
      }[];
    },
    manager: boolean,
  ) {
    const media = post.media[0];
    const locked = isLocked(post.visibility);
    return {
      id: post.id,
      creatorId: post.creatorId,
      caption: post.caption,
      visibility: fromVisibility(post.visibility),
      priceCents: post.priceCents,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      sortOrder: post.sortOrder,
      locked,
      kind: media?.kind ?? "IMAGE",
      mimeType: media?.mimeType ?? "",
      byteSize: media?.byteSize ?? null,
      durationMs: media?.durationMs ?? null,
      posterUrl:
        post.visibility === "SUBSCRIBER_PPV" || !media?.posterKey ? null : `/media/${media.posterKey}`,
      previewUrl: media?.previewKey ? `/media/${media.previewKey}` : null,
      fileUrl: manager || !locked ? (media ? `/v1/media/${media.id}/file` : null) : null,
    };
  }
}

@Module({ controllers: [MediaController] })
export class MediaModule {}
