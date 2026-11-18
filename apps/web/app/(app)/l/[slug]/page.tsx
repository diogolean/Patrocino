import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { parseAffiliateCookie, AFFILIATE_COOKIE } from "@mimelux/core/currency";
import { creatorPageMetadata, fixtureBySlug } from "@/lib/creator-metadata";
import { withCampaignQuery } from "@/lib/creator-route";
import { loadDatabaseProfile } from "@/lib/load-public-catalog";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  return creatorPageMetadata(slug);
}

export default async function CreatorLinksPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query, t, jar] = await Promise.all([props.params, props.searchParams, getTranslations("funnel"), cookies()]);
  const profile = await loadDatabaseProfile(slug);
  const fixture = fixtureBySlug(slug);
  const creator = profile?.creator ?? fixture;
  if (!creator) notFound();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") search.set(key, value);
  }
  const cookie = parseAffiliateCookie(jar.get(AFFILIATE_COOKIE)?.value);
  const subscribe = withCampaignQuery(
    `/checkout?${new URLSearchParams({ kind: "subscription", id: creator.username, return: `/l/${creator.username}` }).toString()}`,
    search,
    cookie,
  );
  const videos = withCampaignQuery(`/creator/${creator.username}?tab=videos`, search, cookie);
  const profileHref = withCampaignQuery(`/creator/${creator.username}`, search, cookie);
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 py-10">
      <div className="flex flex-col items-center text-center">
        {creator.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatar} alt="" className="size-28 rounded-full object-cover shadow-xl" />
        ) : (
          <span className="grid size-28 place-items-center rounded-full bg-primary/20 text-3xl font-black">{creator.name.slice(0, 1)}</span>
        )}
        <h1 className="mt-5 text-3xl font-extrabold tracking-[-.04em]">{creator.name}</h1>
        {creator.bio ? <p className="mt-3 text-sm leading-6 text-muted">{creator.bio}</p> : null}
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <Link href={subscribe} className="flex h-14 items-center justify-center rounded-full bg-gradient-to-r from-primary to-primary-strong text-base font-extrabold text-ink">
          {t("subscribe")}
        </Link>
        <Link href={videos} className="flex h-14 items-center justify-center rounded-full border border-border bg-elevated text-base font-bold">
          {t("videos")}
        </Link>
        <Link href={profileHref} className="flex h-14 items-center justify-center rounded-full border border-border bg-elevated text-base font-bold">
          {t("profile")}
        </Link>
      </div>
    </main>
  );
}
