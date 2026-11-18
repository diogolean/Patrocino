export const PROFILE_GALLERY_COLUMNS = 3;

function mix32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Odd rows hold one video and photos in the rest. Even rows are photos only.
 * The first video row keeps that video in the middle column. Later video rows
 * use a seeded column, and the same seed always picks the same columns.
 */
export function layoutGalleryRows<T>(photos: readonly T[], videos: readonly T[], seedKey: string, columns = PROFILE_GALLERY_COLUMNS): T[] {
  const width = Math.max(1, Math.trunc(columns));
  if (videos.length === 0) return [...photos];
  if (photos.length === 0) return [...videos];
  const next = mix32(hashSeed(seedKey) || 1);
  const result: T[] = [];
  let photoIndex = 0;
  let videoIndex = 0;
  let row = 0;
  while (photoIndex < photos.length && videoIndex < videos.length) {
    const videoRow = row % 2 === 0;
    if (videoRow) {
      const photosNeeded = width - 1;
      if (photoIndex + photosNeeded > photos.length) break;
      const column = width <= 1 ? 0 : row === 0 ? 1 : next() % width;
      for (let cell = 0; cell < width; cell += 1) {
        if (cell === column) {
          result.push(videos[videoIndex] as T);
          videoIndex += 1;
        } else {
          result.push(photos[photoIndex] as T);
          photoIndex += 1;
        }
      }
    } else if (photoIndex + width > photos.length) {
      break;
    } else {
      for (let cell = 0; cell < width; cell += 1) {
        result.push(photos[photoIndex] as T);
        photoIndex += 1;
      }
    }
    row += 1;
  }
  while (photoIndex < photos.length) {
    result.push(photos[photoIndex] as T);
    photoIndex += 1;
  }
  while (videoIndex < videos.length) {
    result.push(videos[videoIndex] as T);
    videoIndex += 1;
  }
  return result;
}

export type GalleryOrderItem = {
  id: string;
  visibility: string;
  featuredRank?: number | null;
  publishedAt?: Date | string | null;
};

function publishedMs(value: Date | string | null | undefined) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Same tie-break the gallery already uses: newer publishedAt first, then id. */
function byPublishedDesc<T extends GalleryOrderItem>(left: T, right: T) {
  return publishedMs(right.publishedAt) - publishedMs(left.publishedAt) || right.id.localeCompare(left.id);
}

export function hasFeaturedRank<T extends GalleryOrderItem>(rows: readonly T[]) {
  return rows.some((row) => typeof row.featuredRank === "number");
}

/**
 * With no featuredRank set, the array is returned as given so a caller that
 * already sorted by publishedAt keeps that exact order.
 * With any rank set: FREE teasers (publishedAt desc), then ranked posts
 * (lower rank first, photos and videos together), then the rest (publishedAt desc).
 */
export function orderFeaturedGallery<T extends GalleryOrderItem>(rows: readonly T[]): T[] {
  if (!hasFeaturedRank(rows)) return [...rows];
  const current = [...rows].sort(byPublishedDesc);
  const free = current.filter((row) => row.visibility === "FREE");
  const featured = current
    .filter((row) => row.visibility !== "FREE" && typeof row.featuredRank === "number")
    .sort((left, right) => (left.featuredRank ?? 0) - (right.featuredRank ?? 0) || byPublishedDesc(left, right));
  const rest = current.filter((row) => row.visibility !== "FREE" && typeof row.featuredRank !== "number");
  return [...free, ...featured, ...rest];
}

export type GallerySlot = { kind: "photo" | "video"; index: number };

/** Same posts-tab order as the profile grid, as indexes into the photo and video lists. */
export function postsTabSlots(photoCount: number, videoCount: number, seedKey: string, columns = PROFILE_GALLERY_COLUMNS): GallerySlot[] {
  const photos: GallerySlot[] = Array.from({ length: photoCount }, (_, index) => ({ kind: "photo", index }));
  const videos: GallerySlot[] = Array.from({ length: videoCount }, (_, index) => ({ kind: "video", index }));
  return layoutGalleryRows(photos, videos, seedKey, columns);
}
