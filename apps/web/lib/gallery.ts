import { PROFILE_GALLERY_COLUMNS, layoutGalleryRows } from "@mimelux/core/profile-gallery";

export type SubscriberVideo = {
  id: string;
  mediaId: string;
  exclusiveIndex: number;
  priceCents: number;
  subscriberCents?: number;
  currency?: "BRL" | "USD";
  previewUrl: string | null;
  /** Unblurred cover, only sent to a fan who bought the video. */
  posterUrl?: string | null;
  purchased: boolean;
  subscribed: boolean;
  durationMs: number | null;
  publishedAt: string | null;
};

/** Card cover: the buyer sees the clear poster, everyone else the blurred preview. */
export function ppvCover(video: Pick<SubscriberVideo, "purchased" | "posterUrl" | "previewUrl">) {
  return video.purchased && video.posterUrl ? video.posterUrl : video.previewUrl;
}

/**
 * The one place that decides how a PPV video card looks on every grid (posts, media, videos):
 * locked or not, which cover, and whether it is blurred. A bought video is never blurred.
 */
export function ppvCardView(video: Pick<SubscriberVideo, "purchased" | "posterUrl" | "previewUrl">) {
  const locked = !video.purchased;
  return { locked, cover: ppvCover(video), blurred: locked };
}

export type GalleryEntry<T> =
  | { kind: "post"; post: T; publishedAt: string }
  | { kind: "video"; video: SubscriberVideo; publishedAt: string };

export function exclusiveIndexes<T extends { id: string; publishedAt?: string }>(items: T[], isVideo: (item: T) => boolean) {
  const ordered = items
    .filter(isVideo)
    .slice()
    .sort((left, right) => (left.publishedAt ?? "").localeCompare(right.publishedAt ?? "") || left.id.localeCompare(right.id));
  return new Map(ordered.map((item, index) => [item.id, index + 1]));
}

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

/** Posts grid column count. The profile grid is three columns at every breakpoint. */
export { PROFILE_GALLERY_COLUMNS, layoutGalleryRows };

type GalleryPost = { mediaType: string; publishedAt: string; visibility?: string };

const LOCKED_POST_VISIBILITY = new Set(["subscriber", "ppv", "subscriber_ppv"]);

function clipIsLocked<T extends GalleryPost>(entry: GalleryEntry<T>) {
  if (entry.kind === "video") return entry.video.purchased === false;
  return entry.post.mediaType === "video" && LOCKED_POST_VISIBILITY.has(entry.post.visibility ?? "");
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
