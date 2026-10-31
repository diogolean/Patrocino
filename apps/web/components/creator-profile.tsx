"use client";

import { useDemoMoney, useVisitorCurrency } from "@/lib/visitor-currency";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  Heart,
  Clapperboard,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MessageCircle,
  Sparkles,
  Star,
  Video,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@mimelux/core/currency";
import { Button, Pill, PremiumModal } from "@mimelux/ui";
import type { Creator, Post } from "@/lib/gateway";
import { compact, plans, reviewsFor } from "@/lib/gateway";
import { PostVisual } from "@/components/post-visual";
import { loadSubscriberCatalog, SubscriberPpvCard, type SubscriberVideo } from "@/components/subscriber-videos";
import { MediaViewer, type ViewerSlide } from "@/components/media-viewer";
import type { ProfileOffers } from "@/lib/creator-offers";
import { PROFILE_GALLERY_COLUMNS, buildProfileGallery, formatActiveUntil, formatDuration, profileVideoCount, renewPlan } from "@/lib/gallery";
import { readDemo, writeDemo, type DemoReview, type DemoSpecialRequest } from "@/lib/demo-store";
import { toast } from "sonner";
import { apiErrorText } from "@/lib/api-error";
import { PAYMENT_CONFIRMED_EVENT } from "@/components/pending-expay-toast";
import { demoAffiliate, recordClick } from "@/lib/affiliates";
import { shownCaption } from "@/lib/public-caption";

const requestStatusKey = {
  requested: "statusRequested",
  quoted: "statusQuoted",
  accepted: "statusAccepted",
  paid: "statusPaid",
  delivered: "statusDelivered",
  declined: "statusDeclined",
  refunded: "statusRefunded",
} as const;

export function CreatorProfile({
  creator,
  posts,
  offers = null,
  gallerySession = "",
  initialTab = "posts",
  openSpecial = false,
}: {
  creator: Creator;
  posts: Post[];
  offers?: ProfileOffers | null;
  gallerySession?: string;
  initialTab?: "posts" | "media" | "videos";
  openSpecial?: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const visitorCurrency = useVisitorCurrency();
  const money = (cents: number) => formatMoney(cents, offers?.currency ?? visitorCurrency, locale);
  const demoMoney = useDemoMoney();
  const t = useTranslations("profile");
  const media = useTranslations("media");
  const errors = useTranslations("errors");
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [unlocks, setUnlocks] = useState<string[]>([]);
  const [tab, setTab] = useState<"posts" | "media" | "videos">(initialTab);
  const [bioOpen, setBioOpen] = useState(false);
  const [promosOpen, setPromosOpen] = useState(true);
  const [requestOpen, setRequestOpen] = useState(openSpecial);
  const [requestDescription, setRequestDescription] = useState("");
  const [requestBudget, setRequestBudget] = useState("");
  const [monetization, setMonetization] = useState(() => readDemo().creatorMonetization);
  const [requests, setRequests] = useState<DemoSpecialRequest[]>([]);
  const [extraReviews, setExtraReviews] = useState<DemoReview[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [now] = useState(() => Date.now());
  const [stripeOn, setStripeOn] = useState(false);
  const [serverSubscribed, setServerSubscribed] = useState(false);
  const [activeUntil, setActiveUntil] = useState<string | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [videos, setVideos] = useState<SubscriberVideo[]>([]);
  const [viewer, setViewer] = useState<{ slides: ViewerSlide[]; index: number } | null>(null);
  const [purchase, setPurchase] = useState<SubscriberVideo | null>(null);
  const [subscribePrompt, setSubscribePrompt] = useState(false);

  useEffect(() => {
    const sync = () => {
      const state = readDemo();
      setSubscribed(state.subscriptions.includes(creator.id));
      setUnlocks(state.unlocks);
      setMonetization(state.creatorMonetization);
      setRequests(state.specialRequests.filter((request) => request.creatorId === creator.id));
      setExtraReviews(state.reviews.filter((review) => review.creatorId === creator.id));
      setLikedIds(state.likes);
    };
    sync();
    window.addEventListener("mimelux:state", sync);
    return () => window.removeEventListener("mimelux:state", sync);
  }, [creator.id]);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/payments/provider", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data: { stripe?: boolean } | null) => {
        if (!cancel) setStripeOn(data?.stripe === true);
      })
      .catch(() => undefined);
    function loadSubscription() {
      void fetch("/api/subscriptions/me", { cache: "no-store" })
        .then(async (response) => (response.ok ? response.json() : null))
        .then((data: { items?: { access?: boolean; creatorUsername?: string; creatorId?: string; currentPeriodEnd?: string | null }[] } | null) => {
          if (cancel || !data?.items) return;
          const match = data.items.find(
            (item) => item.access && (item.creatorUsername === creator.username || item.creatorId === creator.id),
          );
          setServerSubscribed(Boolean(match));
          setActiveUntil(match?.currentPeriodEnd ?? null);
        })
        .catch(() => undefined);
    }
    function reloadCatalog() {
      void loadSubscriberCatalog(creator.username).then((catalog) => {
        if (!cancel) setVideos(catalog);
      });
    }
    loadSubscription();
    window.addEventListener(PAYMENT_CONFIRMED_EVENT, loadSubscription);
    window.addEventListener(PAYMENT_CONFIRMED_EVENT, reloadCatalog);
    void loadSubscriberCatalog(creator.username).then((catalog) => {
      if (cancel) return;
      setVideos(catalog);
      const play = new URLSearchParams(window.location.search).get("play");
      const purchased = catalog.filter((video) => video.purchased);
      const index = purchased.findIndex((video) => video.id === play);
      if (index < 0) return;
      setViewer({
        slides: purchased.map((video) => ({ id: video.id, kind: "video" as const, mediaId: video.mediaId, caption: media("exclusiveVideo", { n: video.exclusiveIndex }) })),
        index,
      });
    });
    return () => {
      cancel = true;
      window.removeEventListener(PAYMENT_CONFIRMED_EVENT, loadSubscription);
      window.removeEventListener(PAYMENT_CONFIRMED_EVENT, reloadCatalog);
    };
  }, [creator.id, creator.username]);

  // Every grid (posts, media, videos) reads the same catalog. Refetch it when the tab changes or the page
  // comes back into view, so a purchase made elsewhere and the short-lived cover grant are never stale.
  const firstTab = useRef(true);
  useEffect(() => {
    let cancel = false;
    const reload = () => {
      void loadSubscriberCatalog(creator.username).then((catalog) => {
        if (!cancel) setVideos(catalog);
      });
    };
    if (firstTab.current) firstTab.current = false;
    else reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancel = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tab, creator.username]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ref") !== demoAffiliate.code) return;
    const subId = params.get("sub") || "direct";
    const state = readDemo();
    if (state.clicks.some((click) => click.code === demoAffiliate.code && click.subId === subId && click.creatorSlug === creator.username)) return;
    writeDemo(recordClick(state, {
      creatorId: creator.id,
      creatorSlug: creator.username,
      subId,
      locale: params.get("lang") || "pt-BR",
      suspicious: /bot|spam/i.test(subId),
    }));
  }, [creator.id, creator.username]);

  const promotion = monetization.promotion;
  const promotionActive =
    promotion.active &&
    now >= new Date(promotion.startsAt).getTime() &&
    now <= new Date(promotion.endsAt).getTime() &&
    (!promotion.subscriberCap || promotion.redeemedCount < promotion.subscriberCap);

  function submitSpecialRequest() {
    if (requestDescription.trim().length < 10) {
      toast.error(t("requestTooShort"));
      return;
    }
    const state = readDemo();
    writeDemo({
      specialRequests: [
        ...state.specialRequests,
        {
          id: `request-${Date.now()}`,
          creatorId: creator.id,
          description: requestDescription.trim(),
          budgetCents: requestBudget ? Math.round(Number(requestBudget) * 100) : undefined,
          status: "requested",
          messages: [{ sender: "fan", body: requestDescription.trim(), createdAt: new Date().toISOString() }],
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setRequestOpen(false);
    setRequestDescription("");
    setRequestBudget("");
    toast.success(t("requestSent"));
  }

  function submitReview() {
    if (!subscribed || reviewBody.trim().length < 4) {
      toast.error(t("reviewTooShort"));
      return;
    }
    const state = readDemo();
    writeDemo({
      reviews: [
        ...state.reviews,
        {
          id: `review-local-${Date.now()}`,
          creatorId: creator.id,
          authorName: t("you"),
          rating: reviewRating,
          body: reviewBody.trim(),
        },
      ],
    });
    setReviewBody("");
    toast.success(t("reviewSaved"));
  }

  const visibleReviews = [...reviewsFor(creator.id), ...extraReviews];
  const averageRating = visibleReviews.length
    ? visibleReviews.reduce((total, review) => total + review.rating, 0) / visibleReviews.length
    : 0;
  const likeTotal =
    posts.reduce((total, post) => total + post.likes, 0) +
    likedIds.filter((id) => posts.some((post) => post.id === id)).length;

  const photoCount = posts.filter((post) => post.mediaType === "image").length;
  const videoCount = profileVideoCount(posts, videos);
  const lockedCount = posts.filter((post) => post.visibility !== "free").length;

  const databasePlans = offers?.source === "database" ? offers.plans : null;
  const primaryPlan = databasePlans?.find((plan) => plan.months === 1) ?? databasePlans?.[0] ?? null;
  const extraPlans = databasePlans?.filter((plan) => plan !== primaryPlan) ?? [];

  function planTotal(months: 1 | 3 | 6 | 12) {
    const plan = plans.find((item) => item.months === months);
    if (!plan || creator.free) return 0;
    return Math.round(
      monetization.monthlyPriceCents *
        plan.months *
        (1 - (monetization.bundleDiscounts[String(plan.months) as "1" | "3" | "6" | "12"] ?? plan.discount) / 100) *
        (promotionActive ? 1 - promotion.discountPercent / 100 : 1),
    );
  }

  function planHref(months: number) {
    const plan = plans.find((item) => item.months === months);
    return `/checkout?kind=subscription&id=${creator.username}&plan=${plan?.id ?? "monthly"}&return=/creator/${creator.username}`;
  }

  function databaseHref(planId: string) {
    return `/checkout?kind=subscription&id=${creator.username}&plan=${planId}&return=/creator/${creator.username}`;
  }

  const memberSubscribed = subscribed || serverSubscribed;
  const until = formatActiveUntil(activeUntil);
  const activeLabel = until ? t("activeUntil", { date: until }) : t("active");
  const showCard = stripeOn && !memberSubscribed;
  const databaseRenew = databasePlans ? renewPlan(databasePlans) : null;
  const renewal = memberSubscribed
    ? databasePlans
      ? databaseRenew
        ? { href: databaseHref(databaseRenew.id), label: databaseRenew.name, cents: databaseRenew.chargeCents }
        : null
      : { href: planHref(3), label: `3 ${t("months")}`, cents: planTotal(3) }
    : null;

  function postLocked(post: Post) {
    if (post.visibility === "subscriber") return !memberSubscribed;
    if (post.visibility === "ppv") return !unlocks.includes(post.id);
    return false;
  }

  function videoCheckout(video: SubscriberVideo) {
    const back = encodeURIComponent(`/creator/${creator.username}?play=${video.id}`);
    return `/checkout?kind=post&id=${video.id}&creator=${creator.username}&return=${back}`;
  }

  const gallerySeed = gallerySession ? `${creator.id}:${gallerySession}` : creator.id;
  const gallery = buildProfileGallery(tab, posts, videos, gallerySeed);

  function openSlides(id: string) {
    const slides: ViewerSlide[] = [];
    for (const entry of gallery) {
      if (entry.kind === "video") {
        if (!entry.video.purchased) continue;
        slides.push({ id: entry.video.id, kind: "video", mediaId: entry.video.mediaId, caption: media("exclusiveVideo", { n: entry.video.exclusiveIndex }) });
        continue;
      }
      if (postLocked(entry.post)) continue;
      slides.push({
        id: entry.post.id,
        kind: entry.post.playback ? "video" : "image",
        src: entry.post.playback || entry.post.image,
        poster: entry.post.poster || entry.post.image,
        caption: shownCaption({
          caption: entry.post.caption,
          video: entry.post.mediaType === "video" || Boolean(entry.post.playback),
          index: entry.post.exclusiveIndex ?? 1,
          videoLabel: (n) => media("exclusiveVideo", { n }),
          photoLabel: (n) => media("exclusivePhoto", { n }),
        }),
      });
    }
    const index = slides.findIndex((slide) => slide.id === id);
    if (index >= 0) setViewer({ slides, index });
  }

  function onPpv(video: SubscriberVideo) {
    if (video.purchased) {
      openSlides(video.id);
      return;
    }
    setPurchase(video);
  }

  function subscribeWithCard() {
    setSubscribing(true);
    void fetch("/api/subscriptions/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId: creator.username, planId: "monthly" }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { url?: string; code?: unknown; message?: unknown };
        if (response.status === 401) {
          router.push("/auth?route=sign-in");
          return;
        }
        if (!response.ok) throw new Error(apiErrorText(data, errors, t("subscribeFailed")));
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        router.push("/assinaturas");
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error && caught.message ? caught.message : t("subscribeFailed"));
      })
      .finally(() => setSubscribing(false));
  }

  const planGlow =
    "shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_45%,transparent),0_10px_24px_-14px_color-mix(in_srgb,var(--primary)_80%,transparent)] transition-shadow duration-300 hover:shadow-[0_0_0_1px_var(--primary),0_0_28px_color-mix(in_srgb,var(--primary)_70%,transparent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--primary),0_0_28px_color-mix(in_srgb,var(--primary)_70%,transparent)] motion-reduce:transition-none";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6 lg:max-w-4xl lg:px-8">
      <div className="relative">
        <div className="relative h-[4.5rem] overflow-hidden rounded-[22px] sm:h-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={creator.cover} alt="" className="h-full w-full object-cover" loading="eager" decoding="async" />
          <div className="absolute inset-0 bg-gradient-to-l from-ink/70 via-ink/20 to-transparent" />
          <div data-testid="profile-cover-stats" className="absolute right-3 top-3 grid max-w-[78%] grid-cols-4 gap-2 text-right text-white sm:right-4 sm:top-4">
            {(
              [
                { value: photoCount, label: t("photos"), Icon: ImageIcon },
                { value: videoCount, label: t("videos"), Icon: Video },
                { value: lockedCount, label: t("locked"), Icon: LockKeyhole },
                { value: compact(likeTotal), label: t("likes"), Icon: Heart, testId: "profile-likes" },
              ] as const
            ).map(({ value, label, Icon, ...rest }) => (
              <div key={label} className="min-w-0">
                <Icon className="ml-auto size-3.5 opacity-80" />
                <b data-testid={"testId" in rest ? rest.testId : undefined} className="mt-1 block text-sm font-semibold leading-none">{value}</b>
                <span className="mt-1 block text-[9px] uppercase tracking-wide text-white/80">{label}</span>
              </div>
            ))}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="profile-avatar"
          src={creator.avatar}
          alt={creator.name}
          className="absolute -bottom-5 left-3 z-20 size-14 rounded-full border-2 border-background bg-background object-cover shadow-[0_10px_24px_rgba(12,13,20,.22)] sm:size-16"
          loading="lazy"
          decoding="async"
        />
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold leading-none tracking-[-.04em] sm:text-2xl">{creator.name}</h1>
          {creator.verified && <BadgeCheck className="size-4 fill-primary text-white" />}
        </div>
        <p className="mt-1 text-xs leading-4 text-muted">@{creator.username}</p>
        <p className={`mt-1.5 max-w-3xl text-[13px] leading-4 ${bioOpen ? "" : "line-clamp-1"}`}>{creator.bio}</p>
        <button type="button" className="text-xs font-semibold leading-4 text-primary-strong" onClick={() => setBioOpen((value) => !value)}>
          {bioOpen ? t("readLess") : t("readMore")}
        </button>
        <div className="mt-1.5 flex items-center gap-1.5">
          {[
            ["instagram", t("socialInstagram")],
            ["x", t("socialX")],
            ["tiktok", t("socialTikTok")],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              onClick={() => toast.info(label)}
              className="grid size-7 place-items-center rounded-full border border-border bg-elevated text-[10px] font-bold"
            >
              {id === "instagram" ? "IG" : id === "x" ? "X" : "♪"}
            </button>
          ))}
          <Link href={`/chat/${creator.id}`} aria-label={t("chat")} className="grid size-7 place-items-center rounded-full border border-border bg-elevated">
            <MessageCircle className="size-3.5" />
          </Link>
        </div>
      </div>

      <section data-testid="profile-plans" className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold leading-4">{t("subscriptions")}</h2>
          {showCard && (
            <button
              type="button"
              data-testid="subscribe-card"
              disabled={subscribing || creator.free}
              onClick={subscribeWithCard}
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-[11px] font-semibold leading-none disabled:opacity-50"
            >
              {subscribing ? <LoaderCircle className="size-3 animate-spin" /> : null}
              {t("subscribeCard")}
            </button>
          )}
        </div>
        <div className="mt-1.5 space-y-1.5">
          {memberSubscribed ? (
            <>
              <Button variant="dark" className="h-11 w-full rounded-full"><BadgeCheck className="size-4" /> {activeLabel}</Button>
              {renewal && (
                <>
                  <button type="button" aria-expanded={renewOpen} onClick={() => setRenewOpen((value) => !value)} className="flex h-7 w-full items-center justify-between text-xs font-medium text-muted">
                    {t("extend")}
                    <ChevronDown className={`size-3.5 transition motion-reduce:transition-none ${renewOpen ? "rotate-180" : ""}`} />
                  </button>
                  {renewOpen && (
                    <Link href={renewal.href} className={`flex h-11 w-full items-center justify-between rounded-full border border-primary/35 bg-gradient-to-r from-primary/20 via-elevated to-accent/20 px-5 text-sm font-semibold ${planGlow}`}>
                      <span>{renewal.label}</span>
                      <span>{creator.free ? t("free") : money(renewal.cents)}</span>
                    </Link>
                  )}
                </>
              )}
            </>
          ) : databasePlans && databasePlans.length === 0 ? (
            <p className="text-sm text-muted">{t("pricesUnavailable")}</p>
          ) : primaryPlan ? (
            <Link href={databaseHref(primaryPlan.id)} className={`flex h-11 w-full items-center justify-between rounded-full bg-gradient-to-r from-primary to-primary-strong/90 px-5 text-sm font-semibold text-ink ${planGlow}`}>
              <span>{primaryPlan.months === 1 ? `1 ${t("month")}` : primaryPlan.name}</span>
              <span data-testid="plan-price" data-months={primaryPlan.months}>{money(primaryPlan.chargeCents)}</span>
            </Link>
          ) : (
            <Link href={planHref(1)} className={`flex h-11 w-full items-center justify-between rounded-full bg-gradient-to-r from-primary to-primary-strong/90 px-5 text-sm font-semibold text-ink ${planGlow}`}>
              <span>1 {t("month")}</span>
              <span data-testid="plan-price" data-months={1}>{creator.free ? t("free") : demoMoney(planTotal(1))}</span>
            </Link>
          )}
          {offers?.packs.map((pack) => (
            <Link key={pack.id} data-testid="pack-card" href={`/checkout?kind=pack&id=${pack.id}&creator=${creator.username}&return=/creator/${creator.username}`} className={`flex w-full items-center gap-3 rounded-[22px] border border-accent/50 bg-gradient-to-r from-accent/25 via-elevated to-primary/20 p-3 ${planGlow}`}>
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-primary text-white"><Sparkles className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold">{pack.name}</span>
                <span className="block text-[11px] leading-4 text-muted">{t("packCardBody")}</span>
              </span>
              <span className="shrink-0 text-right">
                <span data-testid="pack-price" className="block text-sm font-extrabold">{money(pack.priceCents)}</span>
                <span className="block text-[11px] font-bold text-primary-strong">{t("packCta")}</span>
              </span>
            </Link>
          ))}
          {!memberSubscribed && (
          <button type="button" aria-expanded={promosOpen} onClick={() => setPromosOpen((value) => !value)} className="flex h-7 w-full items-center justify-between text-xs font-semibold leading-4">
            {t("promotions")}
            <ChevronDown className={`size-3.5 transition motion-reduce:transition-none ${promosOpen ? "rotate-180" : ""}`} />
          </button>
          )}
          {!memberSubscribed && promosOpen && (
            <div className="space-y-1.5">
              {databasePlans ? (
                offers?.promotion ? (
                  <div data-testid="promotion-banner" className="flex h-8 items-center justify-between gap-3 rounded-full bg-gradient-to-r from-primary/20 to-accent/20 px-4">
                    <p className="truncate text-xs font-semibold">{t("promoBody", { percent: offers.promotion.discountPercent })}</p>
                    {offers.promotion.spotsLeft != null && (
                      <p className="hidden shrink-0 text-[10px] text-muted sm:block">{t("promoMeta", { spots: offers.promotion.spotsLeft })}</p>
                    )}
                  </div>
                ) : null
              ) : promotionActive ? (
                <div data-testid="promotion-banner" className="flex h-8 items-center justify-between gap-3 rounded-full bg-gradient-to-r from-primary/20 to-accent/20 px-4">
                  <p className="truncate text-xs font-semibold">{t("promoBody", { percent: promotion.discountPercent })}</p>
                  <p className="hidden shrink-0 text-[10px] text-muted sm:block">{t("promoMeta", { spots: (promotion.subscriberCap ?? 0) - promotion.redeemedCount })}</p>
                </div>
              ) : null}
              {databasePlans
                ? extraPlans.map((plan) => (
                    <Link key={plan.id} href={databaseHref(plan.id)} className={`flex h-11 w-full items-center justify-between rounded-full border border-primary/35 bg-gradient-to-r from-primary/20 via-elevated to-accent/20 px-5 text-sm font-semibold ${planGlow}`}>
                      <span>{plan.name}</span>
                      <span data-testid="plan-price" data-months={plan.months}>{money(plan.chargeCents)}</span>
                    </Link>
                  ))
                : ([3, 6, 12] as const).map((months) => (
                    <Link key={months} href={planHref(months)} className={`flex h-11 w-full items-center justify-between rounded-full border border-primary/35 bg-gradient-to-r from-primary/20 via-elevated to-accent/20 px-5 text-sm font-semibold ${planGlow}`}>
                      <span>{months} {t("months")}</span>
                      <span data-testid="plan-price" data-months={months}>{creator.free ? t("free") : demoMoney(planTotal(months))}</span>
                    </Link>
                  ))}
            </div>
          )}
        </div>
        <Button variant="outline" data-testid="profile-special" className="mt-1.5 h-10 w-full rounded-full" onClick={() => setRequestOpen(true)}>
          <Sparkles className="size-4" /> {t("special")}
        </Button>
      </section>

      {requests.length > 0 && (
        <section className="mt-5 rounded-[28px] border border-border bg-elevated p-5">
          <h2 className="text-sm font-semibold">{t("yourRequests")}</h2>
          <div className="mt-4 space-y-3">
            {requests.map((request) => (
              <article key={request.id} className="rounded-[20px] bg-surface/70 p-4">
                <div className="flex items-start justify-between gap-3"><p className="line-clamp-2 text-xs font-semibold">{request.description}</p><Pill>{request.status in requestStatusKey ? t(requestStatusKey[request.status]) : request.status}</Pill></div>
                {request.status === "quoted" && request.quotedPriceCents && (
                  <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs font-semibold">{t("counteroffer", { price: formatMoney(request.quotedPriceCents, "BRL", locale) })}</p><Link href={`/checkout?kind=special_request&id=${request.id}&creator=${creator.id}&amount=${request.quotedPriceCents}&return=/creator/${creator.username}`}><Button size="sm">{t("acceptPay")}</Button></Link></div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="mt-2 grid grid-cols-3 border-b border-border">
        <button type="button" onClick={() => setTab("posts")} className={`flex h-9 min-w-0 items-center justify-center gap-1 px-1 text-xs sm:gap-1.5 sm:text-sm ${tab === "posts" ? "border-b-2 border-primary-strong font-semibold" : "text-muted"}`}>
          <ImageIcon className="size-3.5 shrink-0" /> <span className="truncate">{posts.length + videos.length} {t("posts")}</span>
        </button>
        <button type="button" onClick={() => setTab("media")} className={`flex h-9 min-w-0 items-center justify-center gap-1 px-1 text-xs sm:gap-1.5 sm:text-sm ${tab === "media" ? "border-b-2 border-primary-strong font-semibold" : "text-muted"}`}>
          <Video className="size-3.5 shrink-0" /> <span className="truncate">{photoCount + videoCount} {t("media")}</span>
        </button>
        <button type="button" onClick={() => setTab("videos")} className={`flex h-9 min-w-0 items-center justify-center gap-1 px-1 text-xs sm:gap-1.5 sm:text-sm ${tab === "videos" ? "border-b-2 border-primary-strong font-semibold" : "text-muted"}`}>
          <Clapperboard className="size-3.5 shrink-0" /> <span className="truncate">{videoCount} {t("videosTab")}</span>
        </button>
      </div>

      <div
        className="mt-1.5 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${PROFILE_GALLERY_COLUMNS}, minmax(0, 1fr))` }}
      >
        {gallery.map((entry) => {
          if (entry.kind === "video") {
            return <SubscriberPpvCard key={entry.video.id} video={entry.video} onOpen={() => onPpv(entry.video)} />;
          }
          const post = entry.post;
          const locked = postLocked(post);
          return (
            <div key={post.id} data-testid="profile-post" data-locked={locked} onContextMenu={(event) => event.preventDefault()} className={`clickable media-shield group relative aspect-[3/4] overflow-hidden rounded-[16px] ${post.playback ? "bg-black" : "bg-surface"}`}>
              <PostVisual post={post} locked={locked} testId={post.playback ? "profile-video" : undefined} autoPlay />
              {!locked && !post.playback && (
                <button type="button" aria-label={t("openPhoto")} className="absolute inset-0 z-[2]" onClick={() => openSlides(post.id)} />
              )}
              {!locked && post.playback && (
                <button type="button" aria-label={t("openVideo")} className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-black/50 text-white" onClick={() => openSlides(post.id)}>
                  <Maximize2 className="size-3.5" />
                </button>
              )}
              {locked && (
                <Link
                  href={post.visibility === "subscriber" ? planHref(1) : `/checkout?kind=post&id=${post.id}&creator=${creator.id}&return=/creator/${creator.username}`}
                  className="absolute inset-0 z-[3] grid place-items-center bg-ink/25 p-2 text-center text-white"
                >
                  <span>
                    <span className="mx-auto grid size-8 place-items-center rounded-full bg-black/40"><LockKeyhole className="size-3.5" /></span>
                    <span className="mt-2 block text-[10px] font-semibold">{post.visibility === "subscriber" ? t("subscribeUnlock") : t("unlockContent")}</span>
                  </span>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <section data-testid="profile-reviews" className="mt-8 rounded-[28px] border border-border bg-elevated p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary-strong">{t("reviews")}</p>
            <h2 className="mt-1 text-lg font-semibold">{t("reviewers")}</h2>
          </div>
          <p data-testid="profile-rating" className="text-sm font-semibold">{averageRating.toLocaleString(locale, { maximumFractionDigits: 1 })}</p>
        </div>
        <div className="mt-4 space-y-3">
          {visibleReviews.map((review) => (
            <article key={review.id} data-testid="review-card" className="rounded-[20px] bg-surface/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{review.authorName}</p>
                <p className="text-sm font-semibold text-primary-strong" aria-label={t("ratingOf", { rating: review.rating })}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
              </div>
              <p className="mt-2 text-sm leading-6">{review.body}</p>
            </article>
          ))}
        </div>
        {subscribed ? (
          <form data-testid="review-form" className="mt-4" onSubmit={(event) => { event.preventDefault(); submitReview(); }}>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" aria-label={t("score", { value })} onClick={() => setReviewRating(value)}>
                  <Star className={`size-5 ${value <= reviewRating ? "fill-primary text-primary-strong" : "text-muted"}`} />
                </button>
              ))}
            </div>
            <textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} className="mt-3 min-h-24 w-full rounded-2xl border border-border bg-surface/60 p-3 text-sm outline-none focus:ring-2 focus:ring-primary" placeholder={t("reviewPlaceholder")} />
            <Button type="submit" className="mt-3">{t("reviewPublish")}</Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("reviewGate")}</p>
        )}
      </section>

      <PremiumModal open={requestOpen} onClose={() => setRequestOpen(false)} title={t("special")} description={t("requestDescription")}>
        <label className="block text-[10px] font-bold text-muted">{t("description")}
          <textarea value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-border bg-surface/60 p-3 text-xs outline-none focus:ring-2 focus:ring-primary" placeholder={t("requestPlaceholder")} />
        </label>
        <label className="mt-4 block text-[10px] font-bold text-muted">{t("budgetLabel")}
          <input value={requestBudget} onChange={(event) => setRequestBudget(event.target.value)} type="number" min="1" className="mt-2 h-11 w-full rounded-2xl border border-border bg-surface/60 px-3 text-xs outline-none focus:ring-2 focus:ring-primary" placeholder={t("budgetPlaceholder")} />
        </label>
        <Button className="mt-5 w-full" onClick={submitSpecialRequest}>{t("sendRequest")}</Button>
      </PremiumModal>
      <PremiumModal open={subscribePrompt} onClose={() => setSubscribePrompt(false)} title={t("watchTitle")} description={t("watchBody")}>
        <Link href={primaryPlan ? databaseHref(primaryPlan.id) : planHref(1)} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-ink">
          {t("seePlan")}
        </Link>
      </PremiumModal>
      <PremiumModal open={Boolean(purchase)} onClose={() => setPurchase(null)} title={purchase ? media("exclusiveVideo", { n: purchase.exclusiveIndex }) : t("videoFallback")} description={t("purchaseBody")}>
        {purchase && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">
              {formatDuration(purchase.durationMs) ? `${formatDuration(purchase.durationMs)} · ` : ""}
              {money(purchase.priceCents)}
            </p>
            {!purchase.subscribed && purchase.subscriberCents != null && purchase.subscriberCents < purchase.priceCents ? (
              <div className="rounded-2xl bg-primary/15 px-3 py-3 text-sm" data-testid="subscriber-discount">
                <p className="font-extrabold">{t("subscriberDiscount")}</p>
                <p className="mt-1 text-muted">{t("subscriberPays", { price: money(purchase.subscriberCents) })}</p>
                <Link href={primaryPlan ? databaseHref(primaryPlan.id) : planHref(1)} className="mt-2 inline-block font-bold text-primary-strong">
                  {t("seePlan")}
                </Link>
              </div>
            ) : null}
            <Link href={videoCheckout(purchase)} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-ink">
              {t("unlock", { price: money(purchase.priceCents) })}
            </Link>
          </div>
        )}
      </PremiumModal>
      {viewer && (
        <MediaViewer
          slides={viewer.slides}
          index={viewer.index}
          onIndex={(index) => setViewer((current) => (current ? { ...current, index } : current))}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
