import type { Creator, Post } from "./fixtures";
import type { ProfileOffers } from "./creator-offers";
import { parseProfileOffers } from "./creator-offers";
import type { GalleryEntry, SubscriberVideo } from "./gallery";

export function mergePublicCreators<T extends { username: string }>(fixtures: readonly T[], extra: readonly T[]) {
  const seen = new Set(fixtures.map((item) => item.username.toLowerCase()));
  return [...fixtures, ...extra.filter((item) => item.username && !seen.has(item.username.toLowerCase()))];
}

type DatabaseCreator = {
  id?: unknown;
  name?: unknown;
  username?: unknown;
  bio?: unknown;
  city?: unknown;
  avatarUrl?: unknown;
  coverUrl?: unknown;
  category?: unknown;
  verified?: unknown;
  isFree?: unknown;
  monthlyPriceCents?: unknown;
  subscriberCount?: unknown;
  likeCount?: unknown;
  fictitious?: unknown;
  aiGenerated?: unknown;
  currency?: unknown;
  createdAt?: unknown;
  lead?: unknown;
  posts?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function cents(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function databaseCreatorCard(row: unknown): Creator | null {
  if (!row || typeof row !== "object") return null;
  const value = row as DatabaseCreator;
  const username = text(value.username);
  if (!value.id || typeof value.id !== "string" || !username) return null;
  const currency = value.currency === "BRL" || value.currency === "USD" ? value.currency : undefined;
  return {
    id: value.id,
    name: text(value.name) || username,
    username,
    avatar: text(value.avatarUrl),
    cover: text(value.coverUrl) || text(value.avatarUrl),
    category: text(value.category) || "Geral",
    bio: text(value.bio),
    city: text(value.city),
    verified: value.verified !== false,
    free: value.isFree === true,
    price: cents(value.monthlyPriceCents),
    subscribers: cents(value.subscriberCount),
    posts: 0,
    fictitious: value.fictitious === true,
    aiGenerated: value.aiGenerated === true,
    likeCount: cents(value.likeCount),
    ...(currency ? { priceCurrency: currency } : {}),
    createdAt: text(value.createdAt) || new Date(0).toISOString(),
  };
}

function databasePost(row: unknown, creatorId: string): Post | null {
  if (!row || typeof row !== "object") return null;
  const post = row as {
    id?: unknown;
    image?: unknown;
    mediaType?: unknown;
    visibility?: unknown;
    caption?: unknown;
    exclusiveIndex?: unknown;
    likes?: unknown;
    publishedAt?: unknown;
  };
  if (typeof post.id !== "string" || typeof post.image !== "string" || !post.image) return null;
  if (post.image.includes("/private/")) return null;
  const visibility = post.visibility === "free" || post.visibility === "subscriber" || post.visibility === "ppv" ? post.visibility : "subscriber";
  return {
    id: post.id,
    creatorId,
    image: post.image,
    caption: typeof post.caption === "string" ? post.caption : "",
    exclusiveIndex: typeof post.exclusiveIndex === "number" ? post.exclusiveIndex : undefined,
    visibility,
    mediaType: post.mediaType === "video" ? "video" : "image",
    likes: cents(post.likes),
    time: "",
    demo: false,
    publishedAt: typeof post.publishedAt === "string" ? post.publishedAt : new Date(0).toISOString(),
  };
}

export function parseDatabaseCreators(payload: unknown): { creators: Creator[]; posts: Post[] } {
  const items = payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)
    ? (payload as { items: DatabaseCreator[] }).items
    : [];
  const creators: Creator[] = [];
  const posts: Post[] = [];
  for (const row of items) {
    const creator = databaseCreatorCard(row);
    if (!creator) continue;
    creators.push(creator);
    const lead = databasePost(row.lead, creator.id);
    if (lead) posts.push(lead);
  }
  return { creators, posts };
}

export function parseDatabaseProfile(payload: unknown): { creator: Creator; posts: Post[]; offers: ProfileOffers; photos: number; videos: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const creator = databaseCreatorCard(payload);
  const offers = parseProfileOffers(payload);
  if (!creator || !offers) return null;
  const body = payload as { posts?: unknown; photoCount?: unknown; videoCount?: unknown };
  const rows = Array.isArray(body.posts) ? body.posts : [];
  return {
    creator,
    posts: rows.map((row) => databasePost(row, creator.id)).filter((post): post is Post => Boolean(post)),
    offers,
    photos: cents(body.photoCount),
    videos: cents(body.videoCount),
  };
}

export type GalleryPage = {
  photos: number;
  videos: number;
  locked: number;
  nextOffset: number | null;
  seed: string;
  items: GalleryEntry<Post>[];
};

function parseVideo(value: unknown): SubscriberVideo | null {
  if (!value || typeof value !== "object") return null;
  const video = value as Partial<SubscriberVideo> & { caption?: unknown };
  if (typeof video.id !== "string" || typeof video.mediaId !== "string") return null;
  const preview = typeof video.previewUrl === "string" && !video.previewUrl.includes("/private/") ? video.previewUrl : null;
  const poster = typeof video.posterUrl === "string" && !video.posterUrl.includes("/private/") ? video.posterUrl : null;
  return {
    id: video.id,
    mediaId: video.mediaId,
    exclusiveIndex: typeof video.exclusiveIndex === "number" ? video.exclusiveIndex : 1,
    priceCents: cents(video.priceCents),
    subscriberCents: typeof video.subscriberCents === "number" ? video.subscriberCents : undefined,
    currency: video.currency === "BRL" || video.currency === "USD" ? video.currency : undefined,
    previewUrl: preview,
    posterUrl: poster,
    purchased: video.purchased === true,
    subscribed: video.subscribed === true,
    durationMs: typeof video.durationMs === "number" ? video.durationMs : null,
    publishedAt: typeof video.publishedAt === "string" ? video.publishedAt : null,
  };
}

export function parseGalleryPage(payload: unknown): GalleryPage | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { photos?: unknown; videos?: unknown; locked?: unknown; nextOffset?: unknown; seed?: unknown; items?: unknown };
  if (!Array.isArray(body.items)) return null;
  const items: GalleryEntry<Post>[] = [];
  for (const item of body.items) {
    if (!item || typeof item !== "object") continue;
    const row = item as { kind?: unknown; post?: unknown; video?: unknown };
    if (row.kind === "video") {
      const video = parseVideo(row.video);
      if (video) items.push({ kind: "video", video, publishedAt: video.publishedAt ?? "" });
      continue;
    }
    const post = databasePost(row.post, "");
    if (!post) continue;
    const creatorId = row.post && typeof row.post === "object" && typeof (row.post as { creatorId?: unknown }).creatorId === "string"
      ? (row.post as { creatorId: string }).creatorId
      : post.creatorId;
    items.push({ kind: "post", post: { ...post, creatorId }, publishedAt: post.publishedAt });
  }
  return {
    photos: cents(body.photos),
    videos: cents(body.videos),
    locked: cents(body.locked),
    nextOffset: typeof body.nextOffset === "number" ? body.nextOffset : null,
    seed: typeof body.seed === "string" ? body.seed : "profile",
    items,
  };
}
