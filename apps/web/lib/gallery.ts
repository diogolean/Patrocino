export type SubscriberVideo = {
  id: string;
  mediaId: string;
  caption: string;
  priceCents: number;
  previewUrl: string | null;
  purchased: boolean;
  subscribed: boolean;
  durationMs: number | null;
  publishedAt: string | null;
};

export type GalleryEntry<T> =
  | { kind: "post"; post: T; publishedAt: string }
  | { kind: "video"; video: SubscriberVideo; publishedAt: string };

export function mergeGallery<T extends { publishedAt: string }>(posts: T[], videos: SubscriberVideo[]): GalleryEntry<T>[] {
  const entries: GalleryEntry<T>[] = [
    ...posts.map((post) => ({ kind: "post" as const, post, publishedAt: post.publishedAt })),
    ...videos.map((video) => ({
      kind: "video" as const,
      video,
      publishedAt: video.publishedAt ?? "",
    })),
  ];
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const byDate = right.entry.publishedAt.localeCompare(left.entry.publishedAt);
      return byDate || left.index - right.index;
    })
    .map((item) => item.entry);
}

export function formatActiveUntil(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.getTime() <= now) return null;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function renewPlan<T extends { months: number }>(plans: T[]) {
  return plans.find((plan) => plan.months === 3) ?? plans.find((plan) => plan.months > 1) ?? null;
}

export function profileVideoCount(posts: { mediaType: string }[], subscriberVideos: readonly unknown[]) {
  return posts.filter((post) => post.mediaType === "video").length + subscriberVideos.length;
}

export function formatDuration(durationMs: number | null | undefined) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const total = Math.round(durationMs / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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

/** Posts grid column count. The profile grid is three columns at every breakpoint. */
export const PROFILE_GALLERY_COLUMNS = 3;

type GalleryPost = { mediaType: string; publishedAt: string; visibility?: string };

const LOCKED_POST_VISIBILITY = new Set(["subscriber", "ppv", "subscriber_ppv"]);

function clipIsLocked<T extends GalleryPost>(entry: GalleryEntry<T>) {
  if (entry.kind === "video") return entry.video.purchased === false;
  return entry.post.mediaType === "video" && LOCKED_POST_VISIBILITY.has(entry.post.visibility ?? "");
}

/**
 * Odd rows hold one video in a seeded column and photos in the rest.
 * Even rows are photos only. The same seed always picks the same columns.
 * Leftover photos stay in order. Leftover videos are appended at the end.
 */
export function layoutGalleryRows<T>(
  photos: readonly T[],
  videos: readonly T[],
  seedKey: string,
  columns = PROFILE_GALLERY_COLUMNS,
): T[] {
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
      const column = width === 1 ? 0 : next() % width;
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

export function buildProfileGallery<T extends GalleryPost>(
  tab: "posts" | "media" | "videos",
  posts: T[],
  videos: SubscriberVideo[],
  creatorId: string,
  columns = PROFILE_GALLERY_COLUMNS,
): GalleryEntry<T>[] {
  const fixture =
    tab === "videos"
      ? posts.filter((post) => post.mediaType === "video")
      : tab === "media"
        ? posts.filter((post) => post.mediaType === "image" || post.mediaType === "video")
        : posts;
  const merged = mergeGallery(fixture, videos);
  if (tab === "videos") {
    return merged.filter((entry) => entry.kind === "video" || (entry.kind === "post" && entry.post.mediaType === "video"));
  }
  if (tab !== "posts") return merged;
  const photos = merged.filter((entry) => entry.kind === "post" && entry.post.mediaType !== "video");
  const clips = merged.filter((entry) => entry.kind === "video" || (entry.kind === "post" && entry.post.mediaType === "video"));
  const locked = clips.filter((entry) => clipIsLocked(entry));
  const open = clips.filter((entry) => !clipIsLocked(entry));
  return layoutGalleryRows(photos, [...locked, ...open], creatorId, columns);
}
