import { renderCreatorProfile } from "@/lib/render-creator-profile";
import { creatorPageMetadata } from "@/lib/creator-metadata";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ creator: string }> }) {
  const { creator } = await props.params;
  return creatorPageMetadata(creator);
}

export default async function UsernameProfilePage(props: {
  params: Promise<{ creator: string }>;
  searchParams: Promise<{ tab?: string; pedido?: string }>;
}) {
  const [{ creator }, query] = await Promise.all([props.params, props.searchParams]);
  return renderCreatorProfile(creator, query);
}
