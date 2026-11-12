import { randomBytes } from "node:crypto";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { database } from "@mimelux/db/runtime";
import { alignMediaDerivatives, posterKeyFor, previewKeyFor } from "./derivative-access";
import { isRealPreviewFile, writePosterAndPreview } from "./derivatives";
import { openStorage, type DiskStorage } from "./storage";

export type PaidPreviewBackfillOptions = {
  /** Writes files and database keys. Omit it to report what would change. */
  apply?: boolean;
  creatorId?: string;
};

export type PaidPreviewBackfillReport = {
  apply: boolean;
  scanned: number;
  postersMoved: number;
  previewsWritten: number;
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
  posterTarget: string,
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
    if (!(await isRealPreviewFile(posterOut)) || !(await isRealPreviewFile(previewOut))) {
      throw new Error("blurred preview was not created");
    }
    await mkdir(path.dirname(storage.resolve(posterTarget)), { recursive: true });
    await mkdir(path.dirname(storage.resolve(previewTarget)), { recursive: true });
    await rename(posterOut, storage.resolve(posterTarget));
    await rename(previewOut, storage.resolve(previewTarget));
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
    });
    const previewTarget = previewKeyFor({
      creatorId: post.creatorId,
      mediaId: row.id,
      creatorStatus: post.creator.status,
    });
    try {
      const posterMoves = Boolean(row.posterKey) && row.posterKey !== posterTarget;
      const previewMoves = Boolean(row.previewKey) && row.previewKey !== previewTarget;
      const previewReady = (await fileReady(storage, previewTarget)) || (await fileReady(storage, row.previewKey));
      const generate = post.visibility !== "FREE" && !previewReady;
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
        await writeDerivatives(storage, source, posterTarget, previewTarget, row.kind === "VIDEO");
        if (row.posterKey && row.posterKey !== posterTarget && (await storage.exists(row.posterKey))) {
          await storage.remove(row.posterKey);
        }
        if (row.previewKey && row.previewKey !== previewTarget && (await storage.exists(row.previewKey))) {
          await storage.remove(row.previewKey);
        }
        await database.media.update({
          where: { id: row.id },
          data: { posterKey: posterTarget, previewKey: previewTarget },
        });
        report.previewsWritten += 1;
        if (row.posterKey !== posterTarget) report.postersMoved += 1;
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
  return report;
}
