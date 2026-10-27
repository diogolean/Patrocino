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

export function viewerHandleLabel(handle: string | null | undefined) {
  const clean = (handle ?? "").replace(/^@/, "").replace(/[^\w.-]/g, "").slice(0, 32);
  return clean ? `@${clean}` : "";
}
