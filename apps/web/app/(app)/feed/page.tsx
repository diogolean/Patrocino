import Link from "next/link";
import { cookies } from "next/headers";
import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PostCard } from "@/components/post-card";
import { exclusiveIndexes } from "@/lib/gallery";
import { creators, posts, type Post } from "@/lib/gateway";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

function forVisitor(post: Post, cover: string): Post {
  if (post.visibility === "free") return post;
  return { ...post, image: cover, poster: undefined, playback: undefined };
}

export default async function FeedPage() {
  const jar = await cookies();
  const signedIn = Boolean(jar.get(ACCESS_COOKIE)?.value);
  const videoNumbers = exclusiveIndexes(posts, (post) => post.mediaType === "video");
  const t = await getTranslations("feed");
  const nav = await getTranslations("nav");

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-7 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,640px)_300px] lg:py-9">
      <section className="min-w-0">
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary-strong">{t("forYou")}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-[-.04em]">{t("title")}</h1>
          <p className="mt-2 text-xs text-muted">{t("body")}</p>
        </div>

        <div data-testid="trending-strip" className="mb-6">
          <h2 className="text-sm font-extrabold">{nav("trending")}</h2>
          <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {creators.map((creator) => (
              <Link
                key={creator.id}
                href={`/creator/${creator.username}`}
                className="w-[4.5rem] shrink-0 text-center"
              >
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-gradient-to-br from-primary to-accent p-[2px] sm:size-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={creator.avatar}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full rounded-full border-2 border-background object-cover"
                  />
                </span>
                <span className="mt-1.5 block truncate text-[10px] font-semibold">{creator.name.split(" ")[0]}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {posts.map((post) => {
            const creator = creators.find((item) => item.id === post.creatorId);
            if (!creator) return null;
            const numbered = { ...post, exclusiveIndex: videoNumbers.get(post.id) };
            return <PostCard key={post.id} post={signedIn ? numbered : forVisitor(numbered, creator.cover)} creator={creator} />;
          })}
        </div>
      </section>

      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4">
          <div className="rounded-[26px] bg-ink p-5 text-white">
            <Sparkles className="size-5 text-primary" />
            <h2 className="mt-4 text-base font-extrabold">{t("discoverTitle")}</h2>
            <p className="mt-2 text-[10px] leading-5 text-white/60">{t("discoverBody")}</p>
            <Link href="/topcreators?tab=destaques" className="mt-4 inline-block text-[10px] font-bold text-primary">{t("explore")}</Link>
          </div>
          <div className="rounded-[26px] border border-black/5 bg-white/55 p-5 dark:bg-white/5">
            <h3 className="text-xs font-extrabold">{t("suggestions")}</h3>
            <div className="mt-3 space-y-4">
              {creators.slice(4, 7).map((creator) => (
                <Link key={creator.id} href={`/creator/${creator.username}`} className="block overflow-visible">
                  <span className="relative z-0 block h-24 overflow-hidden rounded-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={creator.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </span>
                  <span className="relative z-20 -mt-5 flex items-end gap-3 px-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={creator.avatar} alt="" loading="lazy" decoding="async" className="relative z-20 size-16 shrink-0 rounded-full border-4 border-elevated bg-elevated object-cover shadow-[0_14px_30px_rgba(12,13,20,.22)]" />
                    <span className="min-w-0 flex-1 pb-1"><b className="block truncate text-[10px]">{creator.name}</b><small className="block truncate text-[8px] text-muted">{creator.category}</small></span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
