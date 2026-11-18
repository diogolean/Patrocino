import { fixtureBySlug } from "@/lib/creator-metadata";
import { creatorOgResponse, publicOgSource } from "@/lib/creator-og";
import { loadDatabaseProfile } from "@/lib/load-public-catalog";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const profile = await loadDatabaseProfile(slug);
  const fixture = fixtureBySlug(slug);
  const name = profile?.creator.name || fixture?.name || slug;
  const image =
    publicOgSource(profile?.creator.cover) ||
    publicOgSource(profile?.creator.avatar) ||
    publicOgSource(profile?.posts.find((post) => post.visibility === "free")?.image) ||
    publicOgSource(fixture?.cover) ||
    publicOgSource(fixture?.avatar);
  return creatorOgResponse({ name, image });
}
