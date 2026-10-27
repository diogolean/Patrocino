"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bitcoin, CreditCard, Landmark, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";
import { payoutScheduleConfirmed } from "@mimelux/core";
import { Button, Logo } from "@mimelux/ui";
import { creators } from "@/lib/gateway";

const links = {
  institutional: [
    ["about", "/legal/sobre"],
    ["privacy", "/privacidade"],
    ["terms", "/termos"],
  ],
  creators: [
    ["about", "/auth?route=sign-up&role=creator"],
    ["program", "/legal/criadores"],
  ],
  affiliates: [
    ["program", "/auth?route=sign-up&role=affiliate"],
    ["privacy", "/legal/afiliados"],
  ],
  legal: [
    ["terms", "/termos"],
    ["privacy", "/privacidade"],
    ["guidelines", "/diretrizes"],
    ["refunds", "/reembolso"],
    ["cookies", "/legal/cookies"],
    ["complaints", "/legal/reclamacoes"],
  ],
} as const;

export function MonetizeSection() {
  const t = useTranslations("monetize");
  const footer = useTranslations("footer");

  return (
    <div data-testid="monetize-section" className="relative z-10 bg-background">
      <section
        data-testid="creator-hero"
        className="grid lg:grid-cols-[minmax(480px,0.9fr)_1.1fr]"
      >
        <div className="flex flex-col justify-center px-8 py-20 sm:px-14 lg:px-16 xl:px-24">
          <p className="text-[11px] font-medium uppercase tracking-[.28em] text-primary-strong">
            {t("heroEyebrow")}
          </p>
          <h2 className="mt-6 max-w-sm text-4xl font-medium leading-[1.08] tracking-[-.04em] text-foreground sm:text-5xl">
            {t("heroTitle")}
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-7 text-muted">{t("heroBody")}</p>
          <Link href="/auth?route=sign-up" className="mt-10 w-fit">
            <Button size="lg">{t("singleCta")}</Button>
          </Link>
        </div>
        <FeaturedCarousel demoLabel={t("demo")} />
      </section>

      <section className="border-t border-border px-6 py-14 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-lg font-medium tracking-[-.03em]">{t("title")}</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[t("modelCreator"), t("modelAffiliate"), t("modelClear")].map((label) => (
              <p key={label} className="rounded-[20px] border border-border bg-elevated px-4 py-4 text-sm leading-6 text-muted">
                {label}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section data-testid="how-it-works" className="border-t border-border px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-medium tracking-[-.03em] sm:text-3xl">{t("howTitle")}</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <article className="rounded-[28px] border border-border bg-elevated p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary-strong">{t("howCreator")}</p>
              <ol className="mt-4 space-y-3">
                {[t("stepCreator1"), t("stepCreator2"), t("stepCreator3")].map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-6">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary-strong">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </article>
            <article className="rounded-[28px] border border-border bg-elevated p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary-strong">{t("howAffiliate")}</p>
              <ol className="mt-4 space-y-3">
                {[t("stepAffiliate1"), t("stepAffiliate2"), t("stepAffiliate3")].map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-6">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/25 text-xs font-semibold text-accent-strong">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </article>
          </div>
          <div className="mt-4 rounded-[28px] border border-border bg-elevated p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary-strong">{t("benefitTitle")}</p>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{t("benefitBody")}</p>
              </div>
              {!payoutScheduleConfirmed && (
                <span className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[.14em] text-primary-strong">
                  {t("soon")}
                </span>
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(
                [
                  { Icon: QrCode, label: t("methodPix") },
                  { Icon: CreditCard, label: t("methodCard") },
                  { Icon: Bitcoin, label: t("methodCrypto") },
                ] as const
              ).map(({ Icon, label }) => (
                <p key={label} className="flex items-center gap-3 rounded-full border border-border bg-background px-4 py-3 text-sm font-semibold">
                  <Icon className="size-4 text-primary-strong" />
                  {label}
                </p>
              ))}
            </div>
            {!payoutScheduleConfirmed && <p className="mt-4 text-xs text-muted">{t("payoutFlag")}</p>}
          </div>
        </div>
      </section>

      <footer className="bg-ink px-5 py-12 text-white sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["institutional", links.institutional],
              ["creators", links.creators],
              ["affiliates", links.affiliates],
              ["legal", links.legal],
            ] as const
          ).map(([title, items]) => (
            <div key={title}>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/45">{footer(title)}</p>
              <div className="mt-4 space-y-2">
                {items.map(([label, href]) => (
                  <Link key={href} href={href} className="block text-sm text-white/80 hover:text-white">
                    {footer(label)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl items-center justify-between gap-4 border-t border-white/10 pt-6">
          <Logo compact tone="onDark" />
          <Landmark className="size-4 text-white/40" />
        </div>
        <p className="mx-auto mt-4 max-w-6xl text-[10px] leading-5 text-white/45">{footer("note")}</p>
      </footer>
    </div>
  );
}

function FeaturedCarousel({ demoLabel }: { demoLabel: string }) {
  const t = useTranslations("monetize");
  const featured = creators.slice(0, 6);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % featured.length),
      4_500,
    );
    return () => window.clearInterval(timer);
  }, [featured.length, paused]);

  function move(direction: number) {
    setActive((current) => (current + direction + featured.length) % featured.length);
  }

  return (
    <div
      data-testid="creator-slideshow"
      className="relative mx-3 mb-3 mt-3 min-h-[72vh] min-w-0 overflow-hidden rounded-[36px] lg:mt-0 lg:min-h-[calc(100dvh-1.5rem)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
        setPaused(true);
      }}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchStart.current !== null && end !== undefined) {
          const delta = end - touchStart.current;
          if (Math.abs(delta) > 45) move(delta > 0 ? -1 : 1);
        }
        touchStart.current = null;
        setPaused(false);
      }}
    >
      <div className="absolute inset-0 overflow-hidden bg-ink">
        <div
          className="flex h-full transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {featured.map((creator) => (
            <Link
              key={creator.id}
              href={`/creator/${creator.username}`}
              className="relative block h-full min-w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={creator.cover}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-ink/10" />
              <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-6 text-white sm:p-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={creator.avatar} alt="" className="size-16 rounded-full border-4 border-white/30 object-cover shadow-xl sm:size-20" />
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-2xl font-semibold tracking-[-.03em] sm:text-3xl">{creator.name}</p>
                  <p className="mt-1 text-xs text-white/75">@{creator.username} · {creator.category} · {demoLabel}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 top-6 z-10 flex items-center justify-between px-6 sm:px-8">
        <div className="flex gap-2">
          {featured.map((creator, index) => (
            <button
              key={creator.id}
              type="button"
              aria-label={t("showCreator", { name: creator.name })}
              onClick={() => setActive(index)}
              className={`h-1.5 rounded-full transition-all ${index === active ? "w-8 bg-white" : "w-2 bg-white/45"}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label={t("previous")} onClick={() => move(-1)} className="border-white/30 bg-ink/40 text-white hover:bg-ink/60">
            <ArrowLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label={t("next")} onClick={() => move(1)} className="border-white/30 bg-ink/40 text-white hover:bg-ink/60">
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
