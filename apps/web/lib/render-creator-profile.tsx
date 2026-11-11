import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CreatorProfile } from "@/components/creator-profile";
import { apiBase } from "@/lib/api-auth";
import { visitorForwardHeaders } from "@/lib/client-ip";
import { parseProfileOffers, type ProfileOffers } from "@/lib/creator-offers";
import { creators, posts, postsForCreator } from "@/lib/gateway";
import { loadCreatorGalleryPage, loadDatabaseProfile } from "@/lib/load-public-catalog";

async function loadOffers(username: string): Promise<ProfileOffers | null> {
  try {
    const headerList = await headers();
    const response = await fetch(`${apiBase()}/creators/${encodeURIComponent(username)}`, {
      headers: visitorForwardHeaders(headerList),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    return parseProfileOffers(await response.json());
  } catch {
    return null;
  }
}

export async function renderCreatorProfile(username: string, query: { tab?: string; pedido?: string }) {
  const initialTab = query.tab === "media" || query.tab === "videos" ? query.tab : "posts";
  const creator = creators.find((item) => item.username === username);
  const offers = await loadOffers(username);
  if (!creator) {
    const profile = await loadDatabaseProfile(username);
    if (!profile) notFound();
    const gallerySession = (await headers()).get("x-gallery-session") ?? "";
    const seed = gallerySession ? `${profile.creator.id}:${gallerySession}` : profile.creator.id;
    const gallery = await loadCreatorGalleryPage(username, { tab: initialTab, offset: 0, seed });
    return (
      <CreatorProfile
        creator={profile.creator}
        posts={profile.posts}
        offers={profile.offers}
        gallerySession={gallerySession}
        initialTab={initialTab}
        openSpecial={query.pedido === "especial"}
        galleryPage={gallery ?? { photos: profile.photos, videos: profile.videos, locked: profile.photos + profile.videos, nextOffset: null, seed, items: [] }}
      />
    );
  }

  const creatorPosts = postsForCreator(creator.id);
  const fallbackPosts = posts
    .filter((post) => post.creatorId !== creator.id)
    .slice(0, Math.max(0, 5 - creatorPosts.length))
    .map((post, index) => ({
      ...post,
      id: `${creator.id}-extra-${index}`,
      creatorId: creator.id,
      visibility: "subscriber" as const,
      price: undefined,
    }));

  const priced = offers ?? (process.env.NODE_ENV === "production" ? { source: "database" as const, currency: "BRL" as const, plans: [], packs: [], promotion: null } : null);
  const gallerySession = (await headers()).get("x-gallery-session") ?? "";
  return (
    <CreatorProfile
      creator={creator}
      posts={[...creatorPosts, ...fallbackPosts]}
      offers={priced}
      gallerySession={gallerySession}
      initialTab={initialTab}
      openSpecial={query.pedido === "especial"}
    />
  );
}
