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
  media?: readonly { kind?: string | null }[] | null;
};

function isGalleryVideo(item: GalleryOrderItem) {
  return item.media?.some((media) => media.kind === "VIDEO") === true;
}

/** Free tile column for each featured row: 0, then 2, then 1, then the pattern repeats. */
const FREE_TILE_COLUMNS = [0, 2, 1];

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
 * With any rank set, rows of three are built while FREE posts remain: exactly
 * one FREE tile (newest first) and two locked tiles. The free column follows
 * 0, 2, 1. Every other row takes one locked video (ranked videos by
 * featuredRank, then newest). The other locked slots take ranked photos, then
 * the remaining locked photos newest first. After the FREE posts run out, the
 * leftover photos and videos use layoutGalleryRows.
 */
export function orderFeaturedGallery<T extends GalleryOrderItem>(rows: readonly T[], seedKey = ""): T[] {
  if (!hasFeaturedRank(rows)) return [...rows];
  const width = PROFILE_GALLERY_COLUMNS;
  const current = [...rows].sort(byPublishedDesc);
  const free = current.filter((row) => row.visibility === "FREE");
  const locked = current.filter((row) => row.visibility !== "FREE");
  const ranked = (row: T) => typeof row.featuredRank === "number";
  const byRank = (left: T, right: T) => (left.featuredRank ?? 0) - (right.featuredRank ?? 0) || byPublishedDesc(left, right);
  const videos = [
    ...locked.filter((row) => isGalleryVideo(row) && ranked(row)).sort(byRank),
    ...locked.filter((row) => isGalleryVideo(row) && !ranked(row)),
  ];
  const photos = [
    ...locked.filter((row) => !isGalleryVideo(row) && ranked(row)).sort(byRank),
    ...locked.filter((row) => !isGalleryVideo(row) && !ranked(row)),
  ];
  const placed: T[] = [];
  let row = 0;
  let freeIndex = 0;
  let videoIndex = 0;
  let photoIndex = 0;
  while (freeIndex < free.length && (videoIndex < videos.length || photoIndex < photos.length)) {
    const lockedSlots: T[] = [];
    if (row % 2 === 0 && videoIndex < videos.length) {
      lockedSlots.push(videos[videoIndex] as T);
      videoIndex += 1;
    }
    while (lockedSlots.length < width - 1 && photoIndex < photos.length) {
      lockedSlots.push(photos[photoIndex] as T);
      photoIndex += 1;
    }
    while (lockedSlots.length < width - 1 && videoIndex < videos.length) {
      lockedSlots.push(videos[videoIndex] as T);
      videoIndex += 1;
    }
    if (lockedSlots.length < width - 1) break;
    const freeColumn = FREE_TILE_COLUMNS[row % FREE_TILE_COLUMNS.length] ?? 0;
    let lockedCursor = 0;
    for (let column = 0; column < width; column += 1) {
      if (column === freeColumn) placed.push(free[freeIndex] as T);
      else placed.push(lockedSlots[lockedCursor++] as T);
    }
    freeIndex += 1;
    row += 1;
  }
  const remainingFree = free.slice(freeIndex);
  const remainingPhotos = [...remainingFree.filter((item) => !isGalleryVideo(item)), ...photos.slice(photoIndex)];
  const remainingVideos = [...remainingFree.filter((item) => isGalleryVideo(item)), ...videos.slice(videoIndex)];
  return [...placed, ...layoutGalleryRows(remainingPhotos, remainingVideos, seedKey || "gallery", width)];
}

export type GallerySlot = { kind: "photo" | "video"; index: number };

/** Same posts-tab order as the profile grid, as indexes into the photo and video lists. */
export function postsTabSlots(photoCount: number, videoCount: number, seedKey: string, columns = PROFILE_GALLERY_COLUMNS): GallerySlot[] {
  const photos: GallerySlot[] = Array.from({ length: photoCount }, (_, index) => ({ kind: "photo", index }));
  const videos: GallerySlot[] = Array.from({ length: videoCount }, (_, index) => ({ kind: "video", index }));
  return layoutGalleryRows(photos, videos, seedKey, columns);
}
