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

export type GallerySlot = { kind: "photo" | "video"; index: number };

/** Same posts-tab order as the profile grid, as indexes into the photo and video lists. */
export function postsTabSlots(photoCount: number, videoCount: number, seedKey: string, columns = PROFILE_GALLERY_COLUMNS): GallerySlot[] {
  const photos: GallerySlot[] = Array.from({ length: photoCount }, (_, index) => ({ kind: "photo", index }));
  const videos: GallerySlot[] = Array.from({ length: videoCount }, (_, index) => ({ kind: "video", index }));
  return layoutGalleryRows(photos, videos, seedKey, columns);
}
