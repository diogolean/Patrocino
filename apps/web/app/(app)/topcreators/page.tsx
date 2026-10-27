"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  BadgeCheck,
  MessageCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { brl, compact, creatorLikeTotal, creators } from "@/lib/gateway";
import { readDemo, writeDemo } from "@/lib/demo-store";

function TopCreatorsContent() {
  const t = useTranslations("trending");
  const nav = useTranslations("nav");
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab") === "destaques" ? "destaques" : "top-creators";
  const coachSeen = useSyncExternalStore(
    (callback) => {
      window.addEventListener("mimelux:state", callback);
      return () => window.removeEventListener("mimelux:state", callback);
    },
    () => readDemo().coachSeen,
    () => true,
  );
  const [tourOverride, setTourOverride] = useState<number | null>(null);
  const tour = tourOverride ?? (search.get("tour") === "1" || !coachSeen ? 1 : 0);

  function setTab(next: "top-creators" | "destaques") {
    router.push(`/topcreators?tab=${next}`);
  }

  function finishTour() {
    setTourOverride(0);
    writeDemo({ coachSeen: true });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary-strong">{t("eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-[-.045em] sm:text-4xl">{nav("trending")}</h1>
          <p className="mt-2 text-xs text-muted">{t("body")}</p>
        </div>
        <div className="hidden items-center gap-1 rounded-full bg-surface p-1 sm:flex dark:bg-white/5">
          <button onClick={() => setTab("top-creators")} className={`rounded-full px-5 py-2 text-xs font-bold transition ${tab === "top-creators" ? "bg-white shadow-sm dark:bg-white/10" : "text-muted"}`}>{t("top")}</button>
          <button onClick={() => setTab("destaques")} className={`rounded-full px-5 py-2 text-xs font-bold transition ${tab === "destaques" ? "bg-white shadow-sm dark:bg-white/10" : "text-muted"}`}>{t("highlights")}</button>
        </div>
      </div>

      <div className="relative mt-7 grid grid-cols-2 rounded-2xl bg-surface/60 p-1 sm:hidden dark:bg-white/5">
        <button onClick={() => setTab("top-creators")} className={`rounded-xl py-2.5 text-[11px] font-bold ${tab === "top-creators" ? "bg-white shadow-sm dark:bg-white/10" : "text-muted"}`}>{t("top")}</button>
        <button onClick={() => setTab("destaques")} className={`rounded-xl py-2.5 text-[11px] font-bold ${tab === "destaques" ? "bg-white shadow-sm dark:bg-white/10" : "text-muted"}`}>{t("highlights")}</button>
      </div>

      {tab === "top-creators" ? (
        <section className="mt-6 grid gap-5 sm:grid-cols-2 sm:gap-6 lg:gap-8">
          {creators.map((creator, index) => (
            <Link key={creator.id} href={`/creator/${creator.username}`} className="group min-w-0">
              <article data-testid="ranking-card" className="card-lift relative overflow-visible rounded-[32px] border border-border bg-elevated shadow-sm">
                <div className="relative z-0 h-48 overflow-hidden rounded-t-[32px] sm:h-56 lg:h-[272px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={creator.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                  <span className="absolute right-4 top-3 text-3xl font-black tracking-[-.07em] text-white drop-shadow">#{index + 1}</span>
                  {index < 3 && (
                    <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-ink">
                      {index === 0 ? t("rose") : index === 1 ? t("rising") : t("spotlight")}
                    </span>
                  )}
                </div>
                <div className="relative z-20 flex items-start gap-3 px-4 pb-5 sm:gap-4 sm:px-5 sm:pb-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-testid="ranking-avatar" src={creator.avatar} alt={creator.name} loading="lazy" decoding="async" className="relative z-20 -mt-10 size-20 shrink-0 rounded-full border-4 border-elevated bg-elevated object-cover shadow-[0_14px_30px_rgba(12,13,20,.22)] sm:-mt-12 sm:size-24 lg:-mt-14 lg:size-28" />
                  <div className="min-w-0 flex-1 pt-4">
                    <div className="flex items-center gap-1">
                      <h2 className="truncate text-base font-extrabold sm:text-lg">{creator.name}</h2>
                      {creator.verified && <BadgeCheck className="size-4 shrink-0 fill-primary text-white" />}
                    </div>
                    <p className="truncate text-xs text-muted sm:text-sm">@{creator.username}</p>
                    <p className="truncate text-xs text-muted sm:text-sm">{creator.city}</p>
                  </div>
                  <div className="pb-0.5 text-right">
                    <p className="text-sm font-extrabold">{compact(creator.subscribers)}</p>
                    <p className="text-[11px] text-muted">{t("members")}</p>
                    <p data-testid="ranking-likes" className="mt-1 text-sm font-extrabold">{compact(creatorLikeTotal(creator.id))}</p>
                    <p className="text-[11px] text-muted">{t("likes")}</p>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </section>
      ) : (
        <Highlights />
      )}

      {tour > 0 && (
        <div className="fixed inset-0 z-50 bg-ink/55 backdrop-blur-[2px]">
          <div className={`absolute left-4 right-4 rounded-[28px] bg-white p-5 shadow-2xl sm:left-auto sm:right-8 sm:w-[360px] dark:bg-ink ${tour === 1 ? "top-36 sm:top-24" : "top-52 sm:top-24"}`}>
            <button onClick={finishTour} aria-label={t("closeTip")} className="absolute right-4 top-4 text-muted"><X className="size-4" /></button>
            <span className="grid size-10 place-items-center rounded-2xl bg-primary/25 text-primary-strong">
              {tour === 1 ? <Sparkles className="size-5" /> : <ArrowRight className="size-5" />}
            </span>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[.18em] text-primary-strong">{tour}/2</p>
            <h3 className="mt-1 text-xl font-extrabold tracking-[-.03em]">{tour === 1 ? t("tour1Title") : t("tour2Title")}</h3>
            <p className="mt-2 text-xs leading-5 text-muted">{tour === 1 ? t("tour1Body") : t("tour2Body")}</p>
            <div className="mt-5 flex items-center justify-between">
              <div className="flex gap-1">
                <i className={`h-1.5 rounded-full ${tour === 1 ? "w-5 bg-primary" : "w-1.5 bg-black/15"}`} />
                <i className={`h-1.5 rounded-full ${tour === 2 ? "w-5 bg-primary" : "w-1.5 bg-black/15"}`} />
              </div>
              <Button size="sm" onClick={() => tour === 1 ? (setTourOverride(2), setTab("destaques")) : finishTour()}>
                {tour === 1 ? t("next") : t("gotIt")} <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Highlights() {
  const t = useTranslations("trending");
  const free = creators.filter((creator) => creator.free);
  return (
    <div className="mt-7 space-y-10">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="text-base font-extrabold">{t("freeTitle")}</h2><p className="text-[10px] text-muted">{t("freeBody")}</p></div>
          <button className="text-xs font-bold text-primary-strong">{t("seeAll")}</button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {[...free, ...creators.slice(0, 4)].map((creator, index) => (
            <Link key={`${creator.id}-${index}`} href={`/creator/${creator.username}`} className="relative h-44 w-32 shrink-0 overflow-hidden rounded-[22px] sm:h-48 sm:w-36">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={creator.avatar} alt={creator.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute inset-x-3 bottom-3 text-white"><p className="truncate text-xs font-extrabold">{creator.name}</p><p className="truncate text-[8px] text-white/70">@{creator.username}</p></div>
            </Link>
          ))}
          <button className="grid h-44 w-32 shrink-0 place-items-center rounded-[22px] bg-gradient-to-br from-primary to-accent text-ink sm:h-48 sm:w-36">
            <span><Plus className="mx-auto size-7" /><b className="mt-2 block text-xs">{t("seeMore")}</b></span>
          </button>
        </div>
      </section>

      <section>
        <div className="mb-4"><h2 className="text-base font-extrabold">{t("offersTitle")}</h2><p className="text-[10px] text-muted">{t("offersBody")}</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          {creators.slice(0, 3).map((creator, index) => (
            <Link key={creator.id} href={`/creator/${creator.username}`} className="card-lift flex items-center gap-3 rounded-[22px] border border-black/5 bg-white/60 p-3 dark:bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={creator.avatar} alt="" loading="lazy" decoding="async" className="size-14 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{creator.name}</p><p className="text-[9px] text-muted"><s>{brl(creator.price + 1000)}</s> · <b className="text-primary-strong">{brl(creator.price)}</b></p></div>
              <span className="rounded-full bg-primary/20 px-2 py-1 text-[8px] font-black">-{20 + index * 5}%</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4"><h2 className="text-base font-extrabold">{t("chatTitle")}</h2><p className="text-[10px] text-muted">{t("chatBody")}</p></div>
        <div className="grid gap-x-8 sm:grid-cols-2">
          {creators.slice(0, 6).map((creator) => (
            <div key={creator.id} className="flex items-center gap-3 border-b border-black/5 py-3">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={creator.avatar} alt="" loading="lazy" decoding="async" className="size-11 rounded-full object-cover" />
                <i className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-emerald-500" />
              </div>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{creator.name}</p><p className="truncate text-[9px] text-muted">@{creator.username}</p></div>
              <Link href={`/chat/${creator.id}`} className="rounded-full border border-black/10 px-3 py-2 text-[9px] font-bold"><MessageCircle className="mr-1 inline size-3" /> {t("chat")}</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function TopCreatorsPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-8 h-[70vh] max-w-5xl rounded-[30px] skeleton" />}>
      <TopCreatorsContent />
    </Suspense>
  );
}
