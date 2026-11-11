import { renderCreatorProfile } from "@/lib/render-creator-profile";

export default async function UsernameProfilePage(props: {
  params: Promise<{ creator: string }>;
  searchParams: Promise<{ tab?: string; pedido?: string }>;
}) {
  const [{ creator }, query] = await Promise.all([props.params, props.searchParams]);
  return renderCreatorProfile(creator, query);
}
