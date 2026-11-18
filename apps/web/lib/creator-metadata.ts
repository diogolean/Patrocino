import type { Metadata } from "next";
import { creators } from "@/lib/gateway";
import { loadDatabaseProfile } from "@/lib/load-public-catalog";
import { creatorShare } from "@/lib/creator-share";

export async function creatorPageMetadata(slug: string): Promise<Metadata> {
  const profile = await loadDatabaseProfile(slug);
  const fixture = creators.find((item) => item.username === slug);
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
      images: [{ url: share.image, width: 1200, height: 630, alt: share.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: share.title,
      description: share.description,
      images: [share.image],
    },
  };
}
