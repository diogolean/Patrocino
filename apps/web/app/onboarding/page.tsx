"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Link2,
  LockKeyhole,
  MessageCircle,
  Sparkles,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { AccountRole } from "@mimelux/core";
import { Button, Logo, Pill } from "@mimelux/ui";
import { creators } from "@/lib/gateway";
import { writeDemo } from "@/lib/demo-store";
import { getSessionSnapshot } from "@/lib/session";

const interestIds = ["lifestyle", "fitness", "music", "food", "fashion", "art", "travel", "wellness"] as const;

const fanIcons = [Sparkles, Heart, Users, LockKeyhole] as const;

function subscribe(callback: () => void) {
  window.addEventListener("mimelux:state", callback);
  return () => window.removeEventListener("mimelux:state", callback);
}

function currentRole(): AccountRole {
  const fromQuery = new URLSearchParams(window.location.search).get("role");
  if (fromQuery === "affiliate" || fromQuery === "creator" || fromQuery === "fan") return fromQuery;
  const sessionRole = getSessionSnapshot().user?.role;
  if (sessionRole === "affiliate" || sessionRole === "creator" || sessionRole === "fan") return sessionRole;
  return "fan";
}

function finish(router: ReturnType<typeof useRouter>) {
  writeDemo({ onboarding: true, coachSeen: false });
  const nextRole = getSessionSnapshot().user?.role ?? currentRole();
  router.push(
    nextRole === "affiliate"
      ? "/afiliados"
      : nextRole === "creator"
        ? "/painel"
        : "/topcreators?tab=top-creators",
  );
}

export default function OnboardingPage() {
  const role = useSyncExternalStore(subscribe, currentRole, () => "fan" as AccountRole);
  if (role === "affiliate") return <AffiliateOnboarding />;
  return <FanOnboarding />;
}

function FanOnboarding() {
  const router = useRouter();
  const t = useTranslations("onboarding");
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(["lifestyle", "music", "travel"]);
  const [following, setFollowing] = useState(["luna-ferraz", "bella-monroe"]);
  const steps = [
    { eyebrow: t("s1eyebrow"), title: t("s1title"), body: t("s1body") },
    { eyebrow: t("s2eyebrow"), title: t("s2title"), body: t("s2body") },
    { eyebrow: t("s3eyebrow"), title: t("s3title"), body: t("s3body") },
    { eyebrow: t("s4eyebrow"), title: t("s4title"), body: t("s4body") },
  ];
  const current = steps[step]!;
  const Icon = fanIcons[step]!;

  function next() {
    if (step < steps.length - 1) {
      setStep((value) => value + 1);
      return;
    }
    finish(router);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 sm:px-10">
        <Logo compact />
        <button
          onClick={() => finish(router)}
          className="text-xs font-bold text-muted transition hover:text-foreground"
        >
          {t("skip")} <ArrowRight className="ml-1 inline size-3.5" />
        </button>
      </header>

      <div className="absolute left-1/2 top-[10%] size-[520px] -translate-x-1/2 rounded-full bg-accent/20 blur-[100px]" />

      <section className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center px-5 pb-28 pt-24">
        <div key={step} className="w-full animate-enter text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-[24px] bg-primary/20 text-primary-strong">
            <Icon className="size-7" />
          </div>
          <p className="mt-7 text-xs font-extrabold uppercase tracking-[.24em] text-primary-strong">{current.eyebrow}</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-5xl">
            {current.title}
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted sm:text-base">{current.body}</p>

          {step === 0 && (
            <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3">
              {[
                { icon: Star, text: t("exclusive") },
                { icon: MessageCircle, text: t("direct") },
                { icon: Heart, text: t("support") },
              ].map(({ icon: FeatureIcon, text }) => (
                <div key={text} className="rounded-[24px] border border-black/5 bg-white/55 p-4 dark:bg-white/5">
                  <FeatureIcon className="mx-auto size-5 text-primary-strong" />
                  <p className="mt-3 text-[10px] font-bold sm:text-xs">{text}</p>
                </div>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="mx-auto mt-9 flex max-w-xl flex-wrap justify-center gap-2">
              {interestIds.map((interest) => {
                const active = selected.includes(interest);
                return (
                  <button
                    key={interest}
                    onClick={() =>
                      setSelected((list) =>
                        active ? list.filter((item) => item !== interest) : [...list, interest],
                      )
                    }
                  >
                    <Pill active={active} className="px-5 py-3 text-sm transition hover:-translate-y-0.5">
                      {active && <Check className="mr-1 size-3.5" />}
                      {t(`interest_${interest}`)}
                    </Pill>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="mx-auto mt-9 grid max-w-3xl gap-3 sm:grid-cols-3">
              {creators.slice(0, 3).map((creator) => {
                const active = following.includes(creator.id);
                return (
                  <article key={creator.id} className="rounded-[26px] border border-black/5 bg-white/60 p-4 text-left shadow-sm dark:bg-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={creator.avatar} alt={creator.name} className="size-14 rounded-full object-cover" />
                    <h3 className="mt-3 text-sm font-extrabold">{creator.name}</h3>
                    <p className="text-[10px] text-muted">@{creator.username}</p>
                    <button
                      onClick={() =>
                        setFollowing((list) =>
                          active ? list.filter((item) => item !== creator.id) : [...list, creator.id],
                        )
                      }
                      className={`mt-4 h-9 w-full rounded-full text-xs font-bold transition ${
                        active ? "bg-ink text-white" : "bg-primary text-ink"
                      }`}
                    >
                      {active ? t("following") : t("follow")}
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="mx-auto mt-9 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
              {[
                [t("subscribeTitle"), t("subscribeBody")],
                [t("unlockTitle"), t("unlockBody")],
                [t("chatTitle"), t("chatBody")],
              ].map(([title, body], index) => (
                <div key={title} className="rounded-[24px] border border-black/5 bg-white/60 p-5 dark:bg-white/5">
                  <span className="text-xs font-black text-primary-strong">0{index + 1}</span>
                  <h3 className="mt-4 text-sm font-extrabold">{title}</h3>
                  <p className="mt-2 text-[11px] leading-5 text-muted">{body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-black/5 bg-background/85 px-5 py-5 backdrop-blur sm:px-10">
        <Button
          variant="outline"
          size="icon"
          disabled={step === 0}
          onClick={() => setStep((value) => value - 1)}
          aria-label={t("back")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="text-center">
          <div className="flex gap-1.5">
            {steps.map((_, index) => (
              <i key={index} className={`h-1.5 rounded-full transition-all ${index === step ? "w-7 bg-primary" : "w-1.5 bg-black/15 dark:bg-white/20"}`} />
            ))}
          </div>
          <p className="mt-2 text-[10px] font-semibold text-muted">{t("step", { current: step + 1 })}</p>
        </div>
        <Button size="icon" onClick={next} aria-label={step === 3 ? t("done") : t("next")}>
          {step === 3 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
        </Button>
      </footer>
    </main>
  );
}

function AffiliateOnboarding() {
  const router = useRouter();
  const t = useTranslations("affiliateOnboarding");
  const [step, setStep] = useState(0);
  const steps = [
    { eyebrow: t("s1eyebrow"), title: t("s1title"), body: t("s1body"), icon: Sparkles },
    { eyebrow: t("s2eyebrow"), title: t("s2title"), body: t("s2body"), icon: Users },
    { eyebrow: t("s3eyebrow"), title: t("s3title"), body: t("s3body"), icon: Link2 },
    { eyebrow: t("s4eyebrow"), title: t("s4title"), body: t("s4body"), icon: Wallet },
  ];
  const current = steps[step]!;
  const Icon = current.icon;

  function next() {
    if (step < steps.length - 1) {
      setStep((value) => value + 1);
      return;
    }
    finish(router);
  }

  return (
    <main data-testid="affiliate-onboarding" className="relative min-h-dvh overflow-hidden bg-background">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 sm:px-10">
        <Logo compact />
        <button
          onClick={() => finish(router)}
          className="text-xs font-bold text-muted transition hover:text-foreground"
        >
          {t("skip")} <ArrowRight className="ml-1 inline size-3.5" />
        </button>
      </header>
      <div className="absolute left-1/2 top-[10%] size-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]" />
      <section className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center px-5 pb-28 pt-24 text-center">
        <div key={step} className="w-full animate-enter">
          <div className="mx-auto grid size-16 place-items-center rounded-[24px] bg-accent/20 text-accent-strong">
            <Icon className="size-7" />
          </div>
          <p className="mt-7 text-xs font-extrabold uppercase tracking-[.24em] text-primary-strong">{current.eyebrow}</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-5xl">{current.title}</h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted sm:text-base">{current.body}</p>
        </div>
      </section>
      <footer className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-black/5 bg-background/85 px-5 py-5 backdrop-blur sm:px-10">
        <Button variant="outline" size="icon" disabled={step === 0} onClick={() => setStep((value) => value - 1)} aria-label={t("back")}>
          <ArrowLeft className="size-4" />
        </Button>
        <p className="text-[10px] font-semibold text-muted">{t("step", { current: step + 1 })}</p>
        <Button size="icon" onClick={next} aria-label={step === 3 ? t("done") : t("next")}>
          {step === 3 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
        </Button>
      </footer>
    </main>
  );
}
