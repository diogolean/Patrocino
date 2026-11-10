import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { database } from "@mimelux/db/runtime";
import { viewerCanReadPost } from "./entitlement";
import { openStorage, type DiskStorage } from "./storage";

/** A creator who is not live must not have posters or previews on the static /media tree. */
export function creatorHidesDerivatives(status: string) {
  return status !== "ACTIVE";
}

export function isPrivateMediaKey(key: string | null | undefined) {
  if (!key) return false;
  const bare = key.split("?")[0] ?? key;
  return bare.split(/[/\\]/).some((part) => part === "private" || part === "tmp");
}

/** Clear poster. Subscriber pay-per-view stays under private/ for every creator status. */
export function posterKeyFor(input: {
  creatorId: string;
  mediaId: string;
  visibility: string;
  creatorStatus: string;
}) {
  if (input.visibility === "SUBSCRIBER_PPV" || creatorHidesDerivatives(input.creatorStatus)) {
    return `uploads/${input.creatorId}/private/posters/${input.mediaId}.jpg`;
  }
  return `uploads/${input.creatorId}/posters/${input.mediaId}.jpg`;
}

/** Blurred frame. Public teaser only while the creator is ACTIVE. */
export function previewKeyFor(input: { creatorId: string; mediaId: string; creatorStatus: string }) {
  if (creatorHidesDerivatives(input.creatorStatus)) {
    return `uploads/${input.creatorId}/private/previews/${input.mediaId}.jpg`;
  }
  return `uploads/${input.creatorId}/previews/${input.mediaId}.jpg`;
}

/** Static /media URL for a derivative that is allowed on the public disk. Private keys return null. */
export function staticMediaUrl(key: string | null | undefined, version = "") {
  if (!key || isPrivateMediaKey(key)) return null;
  return `/media/${key}${version ? `?v=${version}` : ""}`;
}

export async function canReadDerivative(input: {
  user: { id: string; role: string };
  owns: boolean;
  creatorStatus: string;
  post: { id: string; creatorId: string; visibility: string; deletedAt: Date | null; publishedAt: Date | null };
}) {
  if (creatorHidesDerivatives(input.creatorStatus)) return input.user.role === "ADMIN" || input.owns;
  return viewerCanReadPost({ user: input.user, owns: input.owns, post: input.post });
}

async function relocate(storage: DiskStorage, from: string, to: string) {
  if (from === to) return to;
  if (await storage.exists(from)) {
    const destination = storage.resolve(to);
    await mkdir(path.dirname(destination), { recursive: true });
    if (await storage.exists(to)) await rm(destination, { force: true });
    try {
      await rename(storage.resolve(from), destination);
    } catch (error) {
      if (!(await storage.exists(to))) throw error;
    }
    return to;
  }
  if (await storage.exists(to)) return to;
  return from;
}

/** Moves poster/preview bytes onto the path required by creator status. Missing files keep their current key. */
export async function alignMediaDerivatives(
  storage: DiskStorage,
  input: {
    mediaId: string;
    creatorId: string;
    creatorStatus: string;
    visibility: string;
    posterKey: string | null;
    previewKey: string | null;
  },
) {
  const posterTarget = input.posterKey
    ? posterKeyFor({
        creatorId: input.creatorId,
        mediaId: input.mediaId,
        visibility: input.visibility,
        creatorStatus: input.creatorStatus,
      })
    : null;
  const previewTarget = input.previewKey
    ? previewKeyFor({ creatorId: input.creatorId, mediaId: input.mediaId, creatorStatus: input.creatorStatus })
    : null;
  const posterKey = input.posterKey && posterTarget ? await relocate(storage, input.posterKey, posterTarget) : input.posterKey;
  const previewKey =
    input.previewKey && previewTarget ? await relocate(storage, input.previewKey, previewTarget) : input.previewKey;
  if (posterKey !== input.posterKey || previewKey !== input.previewKey) {
    await database.media.update({ where: { id: input.mediaId }, data: { posterKey, previewKey } });
  }
  return { posterKey, previewKey };
}

/** Hides derivatives of creators who are not ACTIVE. Runs before the API accepts traffic. */
export async function sealInactiveCreatorDerivatives() {
  const creators = await database.creator.findMany({
    where: { status: { in: ["DRAFT", "PENDING", "SUSPENDED"] } },
    select: { id: true, status: true },
  });
  if (!creators.length) return;
  const storage = await openStorage();
  for (const creator of creators) {
    const rows = await database.media.findMany({
      where: { post: { creatorId: creator.id } },
      select: { id: true, posterKey: true, previewKey: true, post: { select: { visibility: true } } },
    });
    for (const row of rows) {
      if (!row.post) continue;
      try {
        await alignMediaDerivatives(storage, {
          mediaId: row.id,
          creatorId: creator.id,
          creatorStatus: creator.status,
          visibility: row.post.visibility,
          posterKey: row.posterKey,
          previewKey: row.previewKey,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        process.stderr.write(`media seal failed for ${row.id}: ${message}\n`);
      }
    }
  }
}
