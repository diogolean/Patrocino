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

function derivativeVersion(key: string | null | undefined, mediaId: string, folder: "posters" | "previews") {
  if (!key) return null;
  const match = key.match(new RegExp(`/${folder}/${mediaId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.v(\\d+)\\.jpg$`));
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isInteger(version) && version > 0 ? version : null;
}

function isPublicDerivative(key: string, creatorId: string, mediaId: string, folder: "posters" | "previews", version: number) {
  return key === `uploads/${creatorId}/${folder}/${mediaId}.v${version}.jpg`;
}

/**
 * Public FREE poster. Never the legacy `posters/<id>.jpg` path: Cloudflare may have
 * cached a year-long 404 for it. A key that is already public and versioned is kept.
 * Coming back from a private copy bumps the version so a URL that 404'd is not reused.
 */
export function posterKeyFor(input: {
  creatorId: string;
  mediaId: string;
  visibility: string;
  creatorStatus: string;
  currentKey?: string | null;
}) {
  const version = derivativeVersion(input.currentKey, input.mediaId, "posters");
  if (input.visibility !== "FREE" || creatorHidesDerivatives(input.creatorStatus)) {
    if (version != null) return `uploads/${input.creatorId}/private/posters/${input.mediaId}.v${version}.jpg`;
    return `uploads/${input.creatorId}/private/posters/${input.mediaId}.jpg`;
  }
  if (
    version != null &&
    input.currentKey &&
    isPublicDerivative(input.currentKey, input.creatorId, input.mediaId, "posters", version)
  ) {
    return input.currentKey;
  }
  const next = (version ?? 1) + 1;
  return `uploads/${input.creatorId}/posters/${input.mediaId}.v${next}.jpg`;
}

/**
 * Blurred frame. Public while the creator is ACTIVE.
 * A versioned public preview (written by --regenerate-previews) stays put so a later
 * align does not rename it back onto the cached unversioned URL.
 */
export function previewKeyFor(input: { creatorId: string; mediaId: string; creatorStatus: string; currentKey?: string | null }) {
  const version = derivativeVersion(input.currentKey, input.mediaId, "previews");
  if (creatorHidesDerivatives(input.creatorStatus)) {
    if (version != null) return `uploads/${input.creatorId}/private/previews/${input.mediaId}.v${version}.jpg`;
    return `uploads/${input.creatorId}/private/previews/${input.mediaId}.jpg`;
  }
  if (
    version != null &&
    input.currentKey &&
    isPublicDerivative(input.currentKey, input.creatorId, input.mediaId, "previews", version)
  ) {
    return input.currentKey;
  }
  return `uploads/${input.creatorId}/previews/${input.mediaId}.jpg`;
}

/**
 * Next public preview key for a rebuilt blur.
 * The lighter blur always lands on v3 or newer so a cached v2 URL is never reused.
 * Null when that key is already current and force is off.
 */
export function regeneratedPreviewKey(input: {
  creatorId: string;
  mediaId: string;
  creatorStatus: string;
  currentKey?: string | null;
  force?: boolean;
}) {
  const version = derivativeVersion(input.currentKey, input.mediaId, "previews");
  const already = version != null && version >= 3;
  if (already && !input.force) return null;
  const next = input.force ? (version ?? 2) + 1 : 3;
  const folder = creatorHidesDerivatives(input.creatorStatus) ? "private/previews" : "previews";
  return `uploads/${input.creatorId}/${folder}/${input.mediaId}.v${next}.jpg`;
}

function clipVersion(key: string | null | undefined, mediaId: string) {
  if (!key) return null;
  const match = key.match(new RegExp(`/${mediaId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.clip\\.v(\\d+)\\.mp4$`));
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isInteger(version) && version > 0 ? version : null;
}

/** Public muted teaser. Null when this version is already recorded and force is off. */
export function nextPreviewClipKey(input: {
  creatorId: string;
  mediaId: string;
  creatorStatus: string;
  currentKey?: string | null;
  force?: boolean;
}) {
  const version = clipVersion(input.currentKey, input.mediaId);
  if (version != null && !input.force) return null;
  const next = input.force ? (version ?? 0) + 1 : 1;
  const folder = creatorHidesDerivatives(input.creatorStatus) ? "private/previews" : "previews";
  return `uploads/${input.creatorId}/${folder}/${input.mediaId}.clip.v${next}.mp4`;
}

/** What a guest may see for a locked video. The sharp poster and the original file are never included. */
export function guestLockedVideoUrls(input: {
  previewKey: string | null;
  posterKey: string | null;
  storageKey: string;
  previewClipKey: string | null;
}) {
  void input.posterKey;
  void input.storageKey;
  return {
    previewUrl: staticMediaUrl(input.previewKey),
    clipUrl: staticMediaUrl(input.previewClipKey),
    posterUrl: null,
    fileUrl: null,
  };
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
        currentKey: input.posterKey,
      })
    : null;
  const previewTarget = input.previewKey
    ? previewKeyFor({
        creatorId: input.creatorId,
        mediaId: input.mediaId,
        creatorStatus: input.creatorStatus,
        currentKey: input.previewKey,
      })
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
