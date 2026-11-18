import { creatorPageMetadata } from "@/lib/creator-metadata";
import { loadDatabaseProfile, loadPublicPostQuote } from "@/lib/load-public-catalog";
import { CheckoutView } from "./checkout-view";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function creatorKey(query: Record<string, string | string[] | undefined>) {
  const kind = typeof query.kind === "string" ? query.kind : "subscription";
  const id = typeof query.id === "string" ? query.id : "";
  const creator = typeof query.creator === "string" ? query.creator : "";
  return (kind === "subscription" ? id : creator || id).trim();
}

export async function generateMetadata(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const key = creatorKey(await props.searchParams);
  if (!key) return {};
  return creatorPageMetadata(key);
}

export default async function CheckoutPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await props.searchParams;
  const key = creatorKey(query);
  const kind = typeof query.kind === "string" ? query.kind : "";
  const id = typeof query.id === "string" ? query.id : "";
  const creator = typeof query.creator === "string" ? query.creator : "";
  const profile = key ? await loadDatabaseProfile(key) : null;
  const initialPostQuote = kind === "post" && id ? await loadPublicPostQuote((creator || key).trim(), id) : null;
  return <CheckoutView initialIdentity={profile?.creator ?? null} initialOffers={profile?.offers ?? null} initialPostQuote={initialPostQuote} />;
}
