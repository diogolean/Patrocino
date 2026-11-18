import { renderCreatorProfile } from "@/lib/render-creator-profile";
import { creatorPageMetadata } from "@/lib/creator-metadata";

export async function generateMetadata(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  return creatorPageMetadata(username);
}

export default async function CreatorPage(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; pedido?: string }>;
}) {
  const [{ username }, query] = await Promise.all([props.params, props.searchParams]);
  return renderCreatorProfile(username, query);
}
