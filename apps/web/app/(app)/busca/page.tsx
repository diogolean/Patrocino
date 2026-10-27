"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, Search, SlidersHorizontal, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Pill } from "@mimelux/ui";
import { brl, creators } from "@/lib/gateway";

const categories = [
  { id: "all", match: "" },
  { id: "lifestyle", match: "Lifestyle" },
  { id: "fitness", match: "Fitness" },
  { id: "music", match: "Música" },
  { id: "food", match: "Gastronomia" },
  { id: "fashion", match: "Moda" },
  { id: "art", match: "Arte" },
  { id: "travel", match: "Viagem" },
] as const;

export default function SearchPage() {
  const t = useTranslations("search");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]["id"]>("all");
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase(locale);
    const selected = categories.find((item) => item.id === category);
    return creators.filter((creator) => {
      const matchText = !value || `${creator.name} ${creator.username} ${creator.category}`.toLocaleLowerCase(locale).includes(value);
      const matchCategory = !selected?.match || creator.category.toLocaleLowerCase(locale).includes(selected.match.toLocaleLowerCase(locale));
      return matchText && matchCategory;
    });
  }, [query, category, locale]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 lg:py-9">
      <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary-strong">{t("eyebrow")}</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-[-.04em]">{t("title")}</h1>
      <div className="relative mt-6">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("placeholder")} className="h-13 w-full rounded-full border border-black/8 bg-white/70 pl-11 pr-14 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-white/5" />
        <button aria-label={t("filters")} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface dark:bg-white/10"><SlidersHorizontal className="size-4" /></button>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {categories.map((item) => (
          <button key={item.id} onClick={() => setCategory(item.id)}><Pill active={category === item.id}>{t(item.id)}</Pill></button>
        ))}
      </div>

      {!query && (
        <div className="mt-7 rounded-[26px] bg-gradient-to-r from-primary/20 to-accent/25 p-5 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-extrabold"><TrendingUp className="size-4 text-primary-strong" /> {t("trending")}</p>
            <p className="mt-1 text-[10px] text-muted">{t("trendingExamples")}</p>
          </div>
          <p className="mt-4 text-4xl font-black tracking-[-.08em] text-primary sm:mt-0">08</p>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between"><h2 className="text-sm font-extrabold">{query ? t("results", { query }) : t("talents")}</h2><span className="text-[10px] text-muted">{t("profiles", { count: filtered.length })}</span></div>
      <div data-testid="search-results" className="mt-4 grid gap-3 sm:grid-cols-2">
        {filtered.map((creator) => (
          <Link key={creator.id} href={`/creator/${creator.username}`} aria-label={creator.name} className="card-lift min-w-0">
            <article className="relative overflow-visible rounded-[28px] border border-border bg-elevated">
              <div className="relative z-0 h-32 overflow-hidden rounded-t-[28px] sm:h-36">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={creator.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </div>
              <div className="relative z-20 flex items-end gap-3 px-4 pb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img data-testid="search-avatar" src={creator.avatar} alt={creator.name} loading="lazy" decoding="async" className="relative z-20 -mt-10 size-20 shrink-0 rounded-full border-4 border-elevated bg-elevated object-cover shadow-[0_14px_30px_rgba(12,13,20,.22)] sm:size-24" />
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-1"><h3 className="truncate text-xs font-extrabold">{creator.name}</h3>{creator.verified && <BadgeCheck className="size-3.5 shrink-0 fill-primary text-white" />}</div>
                  <p className="mt-0.5 truncate text-[9px] text-muted">@{creator.username} · {creator.category}</p>
                  <p className="mt-1 text-[9px] font-bold text-primary-strong">{creator.free ? t("free") : t("fromPrice", { price: brl(creator.price) })}</p>
                </div>
                <span className="mb-1 shrink-0 rounded-full border border-border px-3 py-2 text-[9px] font-bold">{t("viewProfile")}</span>
              </div>
            </article>
          </Link>
        ))}
      </div>
      {filtered.length === 0 && <div className="mt-16 text-center"><Search className="mx-auto size-8 text-muted" /><h2 className="mt-4 text-sm font-extrabold">{t("emptyTitle")}</h2><p className="mt-2 text-xs text-muted">{t("emptyBody")}</p></div>}
    </div>
  );
}
