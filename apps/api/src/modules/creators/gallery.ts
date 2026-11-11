import { database } from "@mimelux/db/runtime";
import { ppvQuote, type ChargeCurrency } from "@mimelux/core/currency";
import { exclusiveVideoIndex, exclusiveVideoLabel } from "@mimelux/core/exclusive-video";
import { postsTabSlots } from "@mimelux/core/profile-gallery";
import { signMediaGrant } from "../media/signed-url";
import { fanSubscribed, paidPostPurchase } from "../media/entitlement";
import { publicMediaUrl } from "./catalog";

const PAGE_LIMIT = 24;

type Row = {
  id: string;
  caption: string;
  visibility: string;
  likeCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  priceCents: number | null;
  priceCentsUsd: number | null;
  guestPriceCents: number | null;
  guestPriceCentsUsd: number | null;
  media: { id: string; kind: string; posterKey: string | null; previewKey: string | null; durationMs: number | null }[];
};

function byNewest(left: Row, right: Row) {
  return (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0) || right.id.localeCompare(left.id);
}

function posterLink(mediaId: string, userId: string) {
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  return `/v1/media/${mediaId}/poster?token=${encodeURIComponent(signMediaGrant({ mediaId, userId, exp, kind: "poster" }))}`;
}

export async function loadCreatorGallery(input: {
  key: string;
  tab: "posts" | "media" | "videos";
  offset: number;
  limit: number;
  seed: string;
  currency: ChargeCurrency;
  viewerId?: string | null;
}) {
  const keys = Array.from(new Set([input.key, input.key.replace(/-/g, "")]));
  const creator = await database.creator.findFirst({
    where: {
      status: "ACTIVE",
      user: { deletedAt: null },
      OR: [{ id: { in: keys } }, { user: { profile: { is: { username: { in: keys } } } } }],
    },
  });
  if (!creator) return null;
  const rows = await database.post.findMany({
    where: { creatorId: creator.id, deletedAt: null, publishedAt: { lte: new Date() } },
    select: {
      id: true,
      caption: true,
      visibility: true,
      likeCount: true,
      publishedAt: true,
      createdAt: true,
      priceCents: true,
      priceCentsUsd: true,
      guestPriceCents: true,
      guestPriceCentsUsd: true,
      media: {
        select: { id: true, kind: true, posterKey: true, previewKey: true, durationMs: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const photos = rows.filter((row) => !row.media.some((item) => item.kind === "VIDEO")).sort(byNewest);
  const videos = rows.filter((row) => row.media.some((item) => item.kind === "VIDEO")).sort(byNewest);
  const chronological = [...videos].sort(
    (left, right) => (left.publishedAt?.getTime() ?? 0) - (right.publishedAt?.getTime() ?? 0) || left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
  );
  const ordinals = chronological.map((row) => row.id);
  const subscribed = input.viewerId ? await fanSubscribed(input.viewerId, creator.id) : false;
  const bought = new Set<string>();
  if (input.viewerId) {
    const purchases = await database.purchase.findMany({
      where: { buyerId: input.viewerId, creatorId: creator.id, status: "PAID", postId: { not: null } },
      select: { postId: true },
    });
    for (const purchase of purchases) if (purchase.postId) bought.add(purchase.postId);
  }
  const locked = videos.filter((row) => !bought.has(row.id));
  const open = videos.filter((row) => bought.has(row.id));
  const orderedVideos = [...locked, ...open];
  const slots =
    input.tab === "videos"
      ? videos.map((_, index) => ({ kind: "video" as const, index }))
      : input.tab === "media"
        ? [...photos.map((row) => ({ kind: "photo" as const, row })), ...videos.map((row) => ({ kind: "video" as const, row }))]
            .sort((left, right) => byNewest(left.row, right.row))
            .map((item) =>
              item.kind === "photo"
                ? { kind: "photo" as const, index: photos.indexOf(item.row) }
                : { kind: "video" as const, index: videos.indexOf(item.row) },
            )
        : postsTabSlots(photos.length, orderedVideos.length, input.seed);
  const videoList = input.tab === "posts" ? orderedVideos : videos;
  const page = slots.slice(input.offset, input.offset + input.limit);
  const items = [];
  for (const slot of page) {
    const row = slot.kind === "photo" ? photos[slot.index] : videoList[slot.index];
    if (!row) continue;
    const media = row.media[0];
    if (!media) continue;
    if (slot.kind === "video" || media.kind === "VIDEO") {
      const index = exclusiveVideoIndex(ordinals, row.id);
      const priced = ppvQuote({
        currency: input.currency,
        subscribed,
        subscriberBrl: row.priceCents,
        subscriberUsd: row.priceCentsUsd,
        guestBrl: row.guestPriceCents,
        guestUsd: row.guestPriceCentsUsd,
        defaultSubscriberBrl: creator.defaultVideoPriceCents,
        defaultSubscriberUsd: creator.defaultVideoPriceCentsUsd,
        defaultGuestBrl: creator.guestVideoPriceCents,
        defaultGuestUsd: creator.guestVideoPriceCentsUsd,
      });
      const purchased = bought.has(row.id) || (input.viewerId ? await paidPostPurchase(input.viewerId, row.id) : false);
      items.push({
        kind: "video" as const,
        video: {
          id: row.id,
          mediaId: media.id,
          exclusiveIndex: index,
          priceCents: priced.amountCents,
          subscriberCents: priced.subscriberCents,
          currency: input.currency,
          previewUrl: publicMediaUrl(media, row.visibility),
          posterUrl: purchased && input.viewerId ? posterLink(media.id, input.viewerId) : null,
          purchased,
          subscribed,
          durationMs: media.durationMs,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          caption: exclusiveVideoLabel(index, "pt-BR"),
        },
      });
      continue;
    }
    const image = publicMediaUrl(media, row.visibility);
    if (!image) continue;
    items.push({
      kind: "post" as const,
      post: {
        id: row.id,
        creatorId: creator.id,
        image,
        caption: row.caption,
        visibility: row.visibility === "FREE" ? "free" : row.visibility === "PPV" ? "ppv" : "subscriber",
        mediaType: "image" as const,
        likes: row.likeCount,
        time: "",
        demo: false,
        publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      },
    });
  }
  const lockedCount = rows.filter((row) => row.visibility !== "FREE").length;
  return {
    photos: photos.length,
    videos: videos.length,
    locked: lockedCount,
    offset: input.offset,
    limit: input.limit,
    nextOffset: input.offset + input.limit < slots.length ? input.offset + input.limit : null,
    seed: input.seed,
    items,
  };
}

export function galleryQuery(input: { tab?: string; offset?: string; limit?: string; seed?: string }): {
  tab: "posts" | "media" | "videos";
  offset: number;
  limit: number;
  seed: string;
} {
  const tab = input.tab === "media" || input.tab === "videos" ? input.tab : "posts";
  const offset = Number(input.offset ?? 0);
  const limit = Number(input.limit ?? PAGE_LIMIT);
  return {
    tab,
    offset: Number.isInteger(offset) && offset >= 0 ? offset : 0,
    limit: Number.isInteger(limit) ? Math.min(36, Math.max(1, limit)) : PAGE_LIMIT,
    seed: (input.seed ?? "profile").slice(0, 80) || "profile",
  };
}
