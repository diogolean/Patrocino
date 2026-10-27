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

/** Spreads videos through photos. The same seed always yields the same order. */
export function interleaveMedia<T>(photos: readonly T[], videos: readonly T[], seedKey: string): T[] {
  if (videos.length === 0) return [...photos];
  if (photos.length === 0) return [...videos];
  const next = mix32(hashSeed(seedKey) || 1);
  const gap = () => 4 + (next() % 5);
  const result: T[] = [];
  let photoIndex = 0;
  let videoIndex = 0;
  let photosUntilVideo = gap();
  while (photoIndex < photos.length || videoIndex < videos.length) {
    if (photoIndex < photos.length && (photosUntilVideo > 0 || videoIndex >= videos.length)) {
      result.push(photos[photoIndex] as T);
      photoIndex += 1;
      photosUntilVideo -= 1;
      continue;
    }
    if (videoIndex < videos.length && photoIndex < photos.length) {
      result.push(videos[videoIndex] as T);
      videoIndex += 1;
      photosUntilVideo = gap();
      continue;
    }
    if (videoIndex < videos.length) {
      result.push(videos[videoIndex] as T);
      videoIndex += 1;
      continue;
    }
    break;
  }
  return result;
}

type GalleryPost = { mediaType: string; publishedAt: string; visibility?: string };

const LOCKED_POST_VISIBILITY = new Set(["subscriber", "ppv", "subscriber_ppv"]);

function clipIsLocked<T extends GalleryPost>(entry: GalleryEntry<T>) {
  if (entry.kind === "video") return entry.video.purchased === false;
  return entry.post.mediaType === "video" && LOCKED_POST_VISIBILITY.has(entry.post.visibility ?? "");
}

/** Moves the first locked clip into a stable slot among the first three items. */
function placeLockedVideoEarly<T extends GalleryPost>(items: GalleryEntry<T>[], seedKey: string): GalleryEntry<T>[] {
  const index = items.findIndex(clipIsLocked);
  if (index < 0) return items;
  const slot = mix32(hashSeed(`${seedKey}:early`) || 1)() % 3;
  const target = Math.min(slot, items.length - 1);
  if (index === target) return items;
  const next = items.slice();
  const [clip] = next.splice(index, 1);
  next.splice(target, 0, clip as GalleryEntry<T>);
  return next;
}

export function buildProfileGallery<T extends GalleryPost>(
  tab: "posts" | "media" | "videos",
  posts: T[],
  videos: SubscriberVideo[],
  creatorId: string,
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
  return placeLockedVideoEarly(interleaveMedia(photos, clips, creatorId), creatorId);
}
