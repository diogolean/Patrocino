import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CreatorProfile } from "@/components/creator-profile";
import { apiBase } from "@/lib/api-auth";
import { visitorForwardHeaders } from "@/lib/client-ip";
import { parseProfileOffers, type ProfileOffers } from "@/lib/creator-offers";
import { creators, posts, postsForCreator } from "@/lib/gateway";

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

export default async function CreatorPage(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; pedido?: string }>;
}) {
  const [{ username }, query] = await Promise.all([props.params, props.searchParams]);
  const initialTab = query.tab === "media" || query.tab === "videos" ? query.tab : "posts";
  const creator = creators.find((item) => item.username === username);
  const offers = await loadOffers(username);
  if (!creator) notFound();

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
