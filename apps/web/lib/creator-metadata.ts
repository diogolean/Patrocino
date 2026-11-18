import type { Metadata } from "next";
import { creators } from "@/lib/gateway";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/lib/og-size";
import { loadDatabaseProfile } from "@/lib/load-public-catalog";
import { creatorShare } from "@/lib/creator-share";

export function fixtureBySlug(slug: string) {
  return creators.find((item) => item.username === slug || item.id === slug) ?? null;
}

export async function creatorPageMetadata(slug: string): Promise<Metadata> {
  const profile = await loadDatabaseProfile(slug);
  const fixture = fixtureBySlug(slug);
  const origin = (process.env.WEB_ORIGIN || "https://patrocino.com").replace(/\/$/, "");
  const share = creatorShare({
    name: profile?.creator.name || fixture?.name || slug,
    bio: profile?.creator.bio || fixture?.bio || "",
    slug,
    origin,
  });
  return {
    title: { absolute: share.title },
    description: share.description,
    alternates: { canonical: share.url },
    openGraph: {
      title: share.title,
      description: share.description,
      url: share.url,
      siteName: "Patrocino",
      type: "profile",
      images: [{ url: share.image, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: share.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: share.title,
      description: share.description,
      images: [share.image],
    },
  };
}
