import { database } from "@mimelux/db/runtime";
import { amountInCurrency, type ChargeCurrency } from "@mimelux/core/currency";
import { subscriberCounts } from "./subscribers";
import { exclusiveVideoIndex, exclusiveVideoLabel, hideStoredCaption } from "@mimelux/core/exclusive-video";
import { staticMediaUrl } from "../media/derivative-access";
import { chargeForPlan, type PromotionInput } from "../payments/plan-price";

type PublicMedia = { kind: string; posterKey: string | null; previewKey: string | null };

/** Public card image. Paid photos and videos use the blurred preview. FREE posts use the clear poster. */
export function publicMediaUrl(media: PublicMedia, visibility: string) {
  if (visibility !== "FREE") return staticMediaUrl(media.previewKey);
  return staticMediaUrl(media.posterKey) ?? staticMediaUrl(media.previewKey);
}

function cardVisibility(value: string): "free" | "subscriber" | "ppv" {
  if (value === "FREE") return "free";
  if (value === "SUBSCRIBERS") return "subscriber";
  return "ppv";
}

function publicPosts(
  posts: {
    id: string;
    caption: string;
    visibility: string;
    likeCount: number;
    publishedAt: Date | null;
    media: PublicMedia[];
  }[],
) {
  const videoIds = posts
    .filter((post) => post.visibility !== "SUBSCRIBER_PPV" && post.media.some((item) => item.kind === "VIDEO"))
    .slice()
    .sort((left, right) => (left.publishedAt?.getTime() ?? 0) - (right.publishedAt?.getTime() ?? 0) || left.id.localeCompare(right.id))
    .map((post) => post.id);
  const cards = [];
  for (const post of posts) {
    if (post.visibility === "SUBSCRIBER_PPV") continue;
    const media = post.media[0];
    if (!media) continue;
    const image = publicMediaUrl(media, post.visibility);
    if (!image) continue;
    const video = media.kind === "VIDEO";
    const index = exclusiveVideoIndex(videoIds, post.id);
    cards.push({
      id: post.id,
      image,
      mediaType: video ? ("video" as const) : ("image" as const),
      visibility: cardVisibility(post.visibility),
      caption: video || hideStoredCaption(post.caption, false) ? (video ? exclusiveVideoLabel(index, "pt-BR") : "") : post.caption,
      exclusiveIndex: video ? index : undefined,
      likes: post.likeCount,
      publishedAt: (post.publishedAt ?? new Date()).toISOString(),
    });
  }
  return cards;
}

function keysFor(key: string) {
  return Array.from(new Set([key, key.replace(/-/g, "")]));
}

export async function loadCreatorOffers(key: string, currency: ChargeCurrency = "BRL") {
  const keys = keysFor(key);
  const creator = await database.creator.findFirst({
    where: {
      status: "ACTIVE",
      user: { deletedAt: null },
      OR: [{ id: { in: keys } }, { user: { profile: { is: { username: { in: keys } } } } }],
    },
    include: {
      user: { include: { profile: true } },
      plans: { where: { active: true }, orderBy: { durationMonths: "asc" } },
      promotions: { where: { active: true } },
      contentPacks: { where: { active: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!creator) return null;
  const promotions: PromotionInput[] = creator.promotions.map((row) => ({
    planId: row.planId,
    name: row.name,
    discountPercent: row.discountPercent,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    subscriberCap: row.subscriberCap,
    redeemedCount: row.redeemedCount,
    active: row.active,
  }));
  const pricedPlans = creator.plans.map((plan) => {
    const sticker = amountInCurrency(currency, plan.priceCents, plan.priceCentsUsd);
    return { plan, sticker, priced: chargeForPlan({ ...plan, priceCents: sticker.amountCents }, promotions) };
  });
  const plans = pricedPlans.map(({ plan, sticker, priced }) => ({
    id: plan.id,
    name: plan.name,
    months: plan.durationMonths,
    priceCents: priced.chargeCents,
    discountPercent: plan.discountPercent,
    chargeCents: priced.chargeCents,
    currency: sticker.amountCents > 0 ? sticker.currency : currency,
    promotionPercent: priced.promotion?.discountPercent ?? 0,
  }));
  const banner = pricedPlans
    .map((item) => item.priced.promotion)
    .filter((promotion) => promotion != null)
    .sort((left, right) => right.discountPercent - left.discountPercent)[0];
  const profile = creator.user.profile;
  const monthly = plans.find((plan) => plan.months === 1) ?? plans[0];
  const published = { creatorId: creator.id, deletedAt: null, publishedAt: { lte: new Date() } };
  const [photoCount, videoCount, likes, subscribers] = await Promise.all([
    database.post.count({ where: { ...published, media: { none: { kind: "VIDEO" } } } }),
    database.post.count({ where: { ...published, media: { some: { kind: "VIDEO" } } } }),
    database.post.aggregate({ where: published, _sum: { likeCount: true } }),
    subscriberCounts([creator.id]),
  ]);
  return {
    id: creator.id,
    name: profile?.name ?? "Creator",
    username: profile?.username ?? creator.id,
    bio: profile?.bio ?? "",
    city: profile?.city ?? "",
    avatarUrl: profile?.avatarUrl ?? "",
    coverUrl: profile?.coverUrl ?? "",
    category: creator.category,
    verified: true,
    isFree: (monthly?.chargeCents ?? 0) === 0,
    monthlyPriceCents: monthly?.chargeCents ?? 0,
    subscriberCount: subscribers.get(creator.id) ?? 0,
    postCount: photoCount + videoCount,
    photoCount,
    videoCount,
    likeCount: likes._sum.likeCount ?? 0,
    posts: [] as ReturnType<typeof publicPosts>,
    aiGenerated: creator.aiGenerated,
    fictitious: creator.fictitious,
    currency: monthly?.currency ?? currency,
    plans,
    packs: creator.contentPacks.flatMap((pack) => {
      const priced = amountInCurrency(currency, pack.priceCents, pack.priceCentsUsd);
      if (priced.amountCents <= 0) return [];
      return [{ id: pack.id, name: pack.name, priceCents: priced.amountCents, currency: priced.currency }];
    }),
    promotion: banner
      ? {
          name: banner.name,
          discountPercent: banner.discountPercent,
          spotsLeft: banner.subscriberCap == null ? null : Math.max(0, banner.subscriberCap - banner.redeemedCount),
        }
        : null,
  };
}

function monthlyPrice(
  plans: { durationMonths: number; priceCents: number; priceCentsUsd: number; discountPercent: number }[],
  currency: ChargeCurrency,
) {
  const plan = plans.find((item) => item.durationMonths === 1) ?? plans[0];
  if (!plan) return { amountCents: 0, currency };
  return amountInCurrency(currency, plan.priceCents, plan.priceCentsUsd);
}

/** ACTIVE creators for public listings. DRAFT, PENDING, and SUSPENDED stay out. */
export async function listActiveCreators(input: {
  search?: string;
  category?: string;
  currency: ChargeCurrency;
  includeDemo: boolean;
}) {
  const creators = await database.creator.findMany({
    where: {
      ...(input.includeDemo ? {} : { isDemo: false }),
      status: "ACTIVE",
      ...(input.category ? { category: { equals: input.category, mode: "insensitive" } } : {}),
      user: input.search
        ? {
            deletedAt: null,
            profile: {
              is: {
                OR: [
                  { name: { contains: input.search, mode: "insensitive" } },
                  { username: { contains: input.search, mode: "insensitive" } },
                ],
              },
            },
          }
        : { deletedAt: null },
    },
    include: {
      user: { include: { profile: true } },
      plans: { where: { active: true }, orderBy: { durationMonths: "asc" } },
      posts: {
        where: { deletedAt: null, publishedAt: { lte: new Date() } },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        include: { media: { orderBy: { createdAt: "asc" }, take: 1 } },
      },
    },
    take: 80,
    orderBy: { createdAt: "desc" },
  });
  const subscribers = await subscriberCounts(creators.map((creator) => creator.id));
  return creators.map((creator) => {
    const profile = creator.user.profile;
    const lead = creator.posts[0];
    const media = lead?.media[0];
    const image = lead && media ? publicMediaUrl(media, lead.visibility) : null;
    const price = monthlyPrice(creator.plans, input.currency);
    return {
      id: creator.id,
      name: profile?.name ?? "Creator",
      username: profile?.username ?? creator.id,
      bio: profile?.bio ?? "",
      city: profile?.city ?? "",
      avatarUrl: profile?.avatarUrl ?? "",
      coverUrl: profile?.coverUrl ?? "",
      category: creator.category,
      verified: true,
      isFree: price.amountCents === 0,
      monthlyPriceCents: price.amountCents,
      currency: price.amountCents > 0 ? price.currency : input.currency,
      subscriberCount: subscribers.get(creator.id) ?? 0,
      postCount: creator.posts.length,
      likeCount: creator.posts.reduce((total, post) => total + post.likeCount, 0),
      aiGenerated: creator.aiGenerated,
      fictitious: creator.fictitious,
      createdAt: creator.createdAt.toISOString(),
      lead: lead && image
        ? {
            id: lead.id,
            image,
            mediaType: media?.kind === "VIDEO" ? ("video" as const) : ("image" as const),
            visibility: cardVisibility(lead.visibility),
            caption: media?.kind === "VIDEO" || hideStoredCaption(lead.caption, false) ? (media?.kind === "VIDEO" ? exclusiveVideoLabel(1, "pt-BR") : "") : lead.caption,
            likes: lead.likeCount,
            publishedAt: (lead.publishedAt ?? creator.createdAt).toISOString(),
          }
        : null,
    };
  });
}
