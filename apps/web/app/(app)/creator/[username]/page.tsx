import { renderCreatorProfile } from "@/lib/render-creator-profile";

export default async function CreatorPage(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; pedido?: string }>;
}) {
  const [{ username }, query] = await Promise.all([props.params, props.searchParams]);
  return renderCreatorProfile(username, query);
}
