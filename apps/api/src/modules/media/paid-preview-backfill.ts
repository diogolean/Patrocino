import { randomBytes } from "node:crypto";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { database } from "@mimelux/db/runtime";
import { alignMediaDerivatives, nextPreviewClipKey, posterKeyFor, previewKeyFor, regeneratedPreviewKey } from "./derivative-access";
import { isRealClipFile, isRealPreviewFile, writePosterAndPreview, writePreviewClip, mediaDurationSeconds } from "./derivatives";
import { openStorage, type DiskStorage } from "./storage";

export type PaidPreviewBackfillOptions = {
  /** Writes files and database keys. Omit it to report what would change. */
  apply?: boolean;
  creatorId?: string;
  /** Rebuild blurred previews from the clear source onto a new versioned key. */
  regeneratePreviews?: boolean;
  /** With regeneratePreviews, bump the version even when a v3 preview already exists. */
  force?: boolean;
  /** Build a muted 3s blurred clip for locked subscriber videos. */
  clips?: boolean;
};

export type PaidPreviewBackfillReport = {
  apply: boolean;
  scanned: number;
  postersMoved: number;
  previewsWritten: number;
  clipsWritten: number;
  unchanged: number;
  failed: { mediaId: string; message: string }[];
};

async function fileReady(storage: DiskStorage, key: string | null | undefined) {
  if (!key) return false;
  return isRealPreviewFile(storage.resolve(key));
}

async function sourceKey(storage: DiskStorage, storageKey: string, posterKey: string | null) {
  if (storageKey && storageKey !== "pending" && (await storage.exists(storageKey))) return storageKey;
  if (posterKey && (await storage.exists(posterKey))) return posterKey;
  return null;
}

/** Builds poster and preview in a scratch directory, then moves them into place only if both are real JPEGs. */
async function writeDerivatives(
  storage: DiskStorage,
  source: string,
  posterTarget: string | null,
  previewTarget: string,
  video: boolean,
) {
  const scratch = storage.resolve(`uploads/tmp/backfill-${randomBytes(8).toString("hex")}`);
  await mkdir(scratch, { recursive: true });
  const sourceCopy = path.join(scratch, "source");
  const posterOut = path.join(scratch, "poster.jpg");
  const previewOut = path.join(scratch, "preview.jpg");
  try {
    await copyFile(storage.resolve(source), sourceCopy);
    await writePosterAndPreview(sourceCopy, posterOut, previewOut, video);
    if (!(await isRealPreviewFile(previewOut)) || (posterTarget && !(await isRealPreviewFile(posterOut)))) {
      throw new Error("blurred preview was not created");
    }
    await mkdir(path.dirname(storage.resolve(previewTarget)), { recursive: true });
    await rename(previewOut, storage.resolve(previewTarget));
    if (posterTarget) {
      await mkdir(path.dirname(storage.resolve(posterTarget)), { recursive: true });
      await rename(posterOut, storage.resolve(posterTarget));
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * Moves clear posters of paid media under private/ and fills in a real blurred preview when one is missing.
 * FREE posters stay on the public disk. Safe to run more than once. Does nothing unless apply is true.
 */
export async function backfillPaidPreviews(options: PaidPreviewBackfillOptions = {}): Promise<PaidPreviewBackfillReport> {
  const apply = options.apply === true;
  const report: PaidPreviewBackfillReport = {
    apply,
    scanned: 0,
    postersMoved: 0,
    previewsWritten: 0,
    clipsWritten: 0,
    unchanged: 0,
    failed: [],
  };
  const rows = await database.media.findMany({
    where: {
      post: {
        is: {
          deletedAt: null,
          ...(options.creatorId ? { creatorId: options.creatorId } : {}),
        },
      },
    },
    select: {
      id: true,
      kind: true,
      storageKey: true,
      posterKey: true,
      previewKey: true,
      previewClipKey: true,
      post: {
        select: {
          visibility: true,
          creatorId: true,
          creator: { select: { status: true } },
        },
      },
    },
  });
  const storage = await openStorage();
  for (const row of rows) {
    const post = row.post;
    if (!post) continue;
    report.scanned += 1;
    const posterTarget = posterKeyFor({
      creatorId: post.creatorId,
      mediaId: row.id,
      visibility: post.visibility,
      creatorStatus: post.creator.status,
      currentKey: row.posterKey,
    });
    const rebuiltPreview = options.regeneratePreviews
      ? regeneratedPreviewKey({
          creatorId: post.creatorId,
          mediaId: row.id,
          creatorStatus: post.creator.status,
          currentKey: row.previewKey,
          force: options.force,
        })
      : null;
    const previewTarget = rebuiltPreview ?? previewKeyFor({
      creatorId: post.creatorId,
      mediaId: row.id,
      creatorStatus: post.creator.status,
      currentKey: row.previewKey,
    });
    try {
      const posterMoves = Boolean(row.posterKey) && row.posterKey !== posterTarget;
      const previewMoves = Boolean(row.previewKey) && row.previewKey !== previewTarget;
      const previewReady = rebuiltPreview ? false : (await fileReady(storage, previewTarget)) || (await fileReady(storage, row.previewKey));
      const generate = Boolean(rebuiltPreview) || (post.visibility !== "FREE" && !previewReady);
      if (!generate && !posterMoves && !previewMoves) {
        report.unchanged += 1;
        continue;
      }
      if (!apply) {
        if (generate) report.previewsWritten += 1;
        if (posterMoves || (generate && row.posterKey !== posterTarget)) report.postersMoved += 1;
        continue;
      }
      if (generate) {
        const source = await sourceKey(storage, row.storageKey, row.posterKey);
        if (!source) throw new Error("no source image");
        const writePoster = !row.posterKey || row.posterKey !== posterTarget ? posterTarget : null;
        await writeDerivatives(storage, source, writePoster, previewTarget, row.kind === "VIDEO");
        if (writePoster && row.posterKey && row.posterKey !== writePoster && (await storage.exists(row.posterKey))) {
          await storage.remove(row.posterKey);
        }
        // Leave the previous preview file in place. Galleries switch to the new key;
        // deleting the old URL would turn a cached image into a long-lived 404.
        await database.media.update({
          where: { id: row.id },
          data: { posterKey: writePoster ?? row.posterKey ?? posterTarget, previewKey: previewTarget },
        });
        report.previewsWritten += 1;
        if (writePoster && row.posterKey !== writePoster) report.postersMoved += 1;
        continue;
      }
      await alignMediaDerivatives(storage, {
        mediaId: row.id,
        creatorId: post.creatorId,
        creatorStatus: post.creator.status,
        visibility: post.visibility,
        posterKey: row.posterKey,
        previewKey: row.previewKey,
      });
      if (posterMoves) report.postersMoved += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      report.failed.push({ mediaId: row.id, message });
      process.stderr.write(`paid preview backfill failed for ${row.id}: ${message}\n`);
    }
  }
  if (options.clips) {
    for (const row of rows) {
      const post = row.post;
      if (!post || row.kind !== "VIDEO") continue;
      if (post.visibility !== "SUBSCRIBERS" && post.visibility !== "SUBSCRIBER_PPV") continue;
      if (!row.storageKey || row.storageKey === "pending") continue;
      try {
        let target = nextPreviewClipKey({
          creatorId: post.creatorId,
          mediaId: row.id,
          creatorStatus: post.creator.status,
          currentKey: row.previewClipKey,
          force: options.force,
        });
        if (!target && row.previewClipKey && !(await isRealClipFile(storage.resolve(row.previewClipKey)))) {
          target = nextPreviewClipKey({
            creatorId: post.creatorId,
            mediaId: row.id,
            creatorStatus: post.creator.status,
            currentKey: row.previewClipKey,
            force: true,
          });
        }
        if (!target) continue;
        if (!apply) {
          report.clipsWritten += 1;
          continue;
        }
        if (!(await storage.exists(row.storageKey))) throw new Error("no source video");
        const scratch = storage.resolve(`uploads/tmp/clip-${randomBytes(8).toString("hex")}`);
        await mkdir(scratch, { recursive: true });
        const sourceCopy = path.join(scratch, "source");
        const clipOut = path.join(scratch, "clip.mp4");
        try {
          await copyFile(storage.resolve(row.storageKey), sourceCopy);
          const duration = await mediaDurationSeconds(sourceCopy);
          await writePreviewClip(sourceCopy, clipOut, duration);
          if (!(await isRealClipFile(clipOut))) throw new Error("teaser clip was not created");
          await mkdir(path.dirname(storage.resolve(target)), { recursive: true });
          await rename(clipOut, storage.resolve(target));
        } finally {
          await rm(scratch, { recursive: true, force: true });
        }
        await database.media.update({ where: { id: row.id }, data: { previewClipKey: target } });
        report.clipsWritten += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        report.failed.push({ mediaId: row.id, message });
        process.stderr.write(`preview clip failed for ${row.id}: ${message}\n`);
      }
    }
  }
  return report;
}
