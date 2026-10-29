"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  CreditCard,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Logo, Pill } from "@mimelux/ui";
import { apiErrorText } from "@/lib/api-error";
import { brl, creators, plans, posts } from "@/lib/gateway";
import { commissionForSale } from "@/lib/affiliates";
import { paymentGateway } from "@/lib/payments";
import { mockDelay, readDemo, writeDemo } from "@/lib/demo-store";
import { toast } from "sonner";
import { ExpayCheckoutModal } from "@/components/expay-checkout-modal";
import { PushOptIn } from "@/components/push-opt-in";
import { StripeCheckoutModal } from "@/components/stripe-checkout-modal";
import { parseProfileOffers, type ProfileOffers } from "@/lib/creator-offers";
import { authHref } from "@/lib/auth-return";

function DemoPaymentGraphic({ seed, label }: { seed: string; label: string }) {
  const cells = useMemo(() => {
    let hash = 0;
    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return Array.from({ length: 225 }, (_, index) => {
      const x = index % 15;
      const y = Math.floor(index / 15);
      const marker =
        (x < 4 && y < 4) ||
        (x > 10 && y < 4) ||
        (x < 4 && y > 10);
      const bit = ((hash >> (index % 24)) ^ (index * 13 + y * 7)) & 1;
      return marker || bit === 1;
    });
  }, [seed]);

  return (
    <div className="relative grid size-48 grid-cols-[repeat(15,1fr)] gap-[3px] overflow-hidden rounded-[32px] bg-surface p-5 shadow-inner">
      {cells.map((active, index) => <i key={index} className={active ? "rounded-full bg-primary/55" : "rounded-full bg-white/35"} />)}
      <span className="absolute inset-x-5 top-1/2 -translate-y-1/2 rotate-[-8deg] rounded-full bg-ink px-4 py-2 text-center text-[10px] font-black tracking-[.22em] text-white shadow-xl">
        {label}
      </span>
    </div>
  );
}

function CheckoutContent() {
  const t = useTranslations("checkout");
  const errors = useTranslations("errors");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const kind = search.get("kind") || "subscription";
  const id = search.get("id") || "luna-ferraz";
  const creatorId = kind === "subscription" ? id : search.get("creator") || "luna-ferraz";
  const creator = creators.find((item) => item.id === creatorId || item.username === creatorId) || creators[0]!;
  const quoteCreatorId = creatorId;
  const post = posts.find((item) => item.id === id);
  const message = kind === "message";
  const pack = kind === "pack";
  const specialRequest = kind === "special_request";
  const planParam = search.get("plan") || "monthly";
  const plan = plans.find((item) => item.id === planParam) || plans[0]!;
  const subscriptionTotal = Math.round(
    creator.price * plan.months * (1 - plan.discount / 100),
  );
  const requestedAmount = Number(search.get("amount"));
  const amount =
    kind === "subscription"
      ? subscriptionTotal
      : message
        ? 1290
        : pack
          ? 4990
          : specialRequest && Number.isFinite(requestedAmount)
            ? requestedAmount
            : post?.price || 990;
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [paidVia, setPaidVia] = useState<"demo" | "pix" | "card">("demo");
  const [pixOpen, setPixOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [methods, setMethods] = useState({ expay: false, stripe: false, stripePublishableKey: "" });
  const [catalog, setCatalog] = useState<ProfileOffers | null>(null);
  const returnPath = search.get("return")?.startsWith("/") ? search.get("return")! : `/creator/${creator.username}`;
  const purpose: "subscription" | "post" | "message" | "pack" | "special_request" =
    kind === "subscription" || kind === "message" || kind === "pack" || kind === "special_request" ? kind : "post";

  useEffect(() => {
    let cancel = false;
    fetch("/api/payments/provider")
      .then((response) => response.json())
      .then((payload: { expay?: boolean; stripe?: boolean; stripePublishableKey?: string | null }) => {
        if (cancel) return;
        setMethods({
          expay: payload.expay === true,
          stripe: payload.stripe === true,
          stripePublishableKey: payload.stripePublishableKey ?? "",
        });
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/creators/${encodeURIComponent(quoteCreatorId)}`, { cache: "no-store" })
      .then(async (response) => (response.ok ? parseProfileOffers(await response.json()) : null))
      .then((parsed) => {
        if (!cancel) setCatalog(parsed);
      })
      .catch(() => {
        if (!cancel) setCatalog(null);
      });
    return () => {
      cancel = true;
    };
  }, [quoteCreatorId]);

  const realCheckout = methods.expay || methods.stripe;
  const subjectId = kind === "subscription" ? planParam : id;
  const quoteKey = realCheckout ? `${quoteCreatorId}:${purpose}:${subjectId}` : "";
  const [quote, setQuote] = useState<{ key: string; cents: number | null; error: string; needsAuth: boolean }>({
    key: "",
    cents: null,
    error: "",
    needsAuth: false,
  });
  if (quote.key !== quoteKey) {
    setQuote({ key: quoteKey, cents: null, error: "", needsAuth: false });
  }
  const quotedCents = quote.cents;
  const quoteError = quote.error;
  const signInHref = authHref("sign-in", search.toString() ? `${pathname}?${search.toString()}` : pathname);
  const catalogPlan =
    catalog?.plans.find((item) => item.id === planParam) ??
    catalog?.plans.find((item) => item.months === plan.months);
  const catalogPack = catalog?.packs.find((item) => item.id === id);
  const catalogCents = kind === "subscription" ? catalogPlan?.chargeCents : kind === "pack" ? catalogPack?.priceCents : undefined;
  const fixturePrices = process.env.NODE_ENV !== "production";
  const shownCents = quotedCents ?? catalogCents ?? (fixturePrices ? amount : null);
  const pixKey = useMemo(() => `pix-${purpose}-${creator.id}-${id}-${crypto.randomUUID()}`, [purpose, creator.id, id]);
  const cardKey = useMemo(() => `card-${purpose}-${creator.id}-${id}-${crypto.randomUUID()}`, [purpose, creator.id, id]);
  const rememberAmount = useCallback((cents: number) => {
    setQuote((current) => ({ ...current, cents, error: "" }));
  }, []);

  useEffect(() => {
    if (!quoteKey) return;
    let cancel = false;
    const key = quoteKey;
    fetch("/api/payments/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId: quoteCreatorId, purpose, subjectId }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { amountCents?: number; message?: string };
        if (cancel) return;
        if (!response.ok || typeof payload.amountCents !== "number") {
          setQuote({
            key,
            cents: null,
            error: response.status === 401 ? "" : apiErrorText(payload, errors, t("unavailable")),
            needsAuth: response.status === 401,
          });
          return;
        }
        setQuote({ key, cents: payload.amountCents, error: "", needsAuth: false });
      })
      .catch(() => {
        if (!cancel) setQuote({ key, cents: null, error: t("quoteFailed"), needsAuth: false });
      });
    return () => {
      cancel = true;
    };
  }, [quoteKey, quoteCreatorId, purpose, subjectId, t, errors]);

  function grantLocalAccess(via: "demo" | "pix" | "card" = "demo") {
    const state = readDemo();
    const transactionKind =
      kind === "subscription"
        ? "subscription"
        : kind === "pack"
          ? "pack"
          : kind === "special_request"
            ? "special_request"
            : "ppv";
    const commissionPatch = commissionForSale(state, {
      creatorId: creator.id,
      creatorName: creator.name,
      amountCents: shownCents ?? amount,
      transactionKind,
      reference: id,
    });
    if (kind === "subscription") {
      writeDemo({
        subscriptions: Array.from(new Set([...state.subscriptions, creator.id])),
        ...commissionPatch,
      });
    } else if (specialRequest) {
      writeDemo({
        specialRequests: state.specialRequests.map((request) =>
          request.id === id ? { ...request, status: "paid" as const } : request,
        ),
        ...commissionPatch,
      });
    } else {
      writeDemo({
        unlocks: Array.from(new Set([...state.unlocks, id])),
        ...commissionPatch,
      });
    }
    setPaidVia(via);
    setPaid(true);
    toast.success(kind === "subscription" ? t("subscriptionActivated") : t("contentUnlocked"));
  }

  async function simulate() {
    setPaying(true);
    await mockDelay(900);
    await paymentGateway.recordConfirmedPayment({
      provider: "pix",
      amountCents: amount,
      currency: "BRL",
      description: kind,
      idempotencyKey: `${kind}-${creator.id}-${id}`,
    });
    grantLocalAccess();
    setPaying(false);
  }

  if (paid) {
    return (
      <div className="grid min-h-[calc(100dvh-64px)] place-items-center px-5">
        <div className="w-full max-w-md rounded-[32px] border border-black/5 bg-white/70 p-8 text-center shadow-2xl dark:bg-white/5">
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-500/15 text-emerald-600"><Check className="size-9" strokeWidth={3} /></span>
          <p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-emerald-600">{paidVia === "demo" ? t("simulatedPayment") : t("confirmedPayment")}</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-[-.04em]">{kind === "subscription" ? t("youBelong") : specialRequest ? t("requestConfirmed") : t("contentReleased")}</h1>
          <p className="mt-3 text-xs leading-5 text-muted">{kind === "subscription" ? t("subscriptionActive", { name: creator.name }) : t("availableNow")}</p>
          {kind === "subscription" && <PushOptIn className="mt-6" />}
          <Button size="lg" className="mt-7 w-full" onClick={() => router.push(returnPath)}>{t("seeNow")} <Sparkles className="size-4" /></Button>
          {paidVia === "demo" && <p className="mt-4 text-[9px] text-muted">{t("noRealCharge")}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-[calc(100dvh-64px)] w-full max-w-5xl gap-8 px-4 py-7 sm:px-8 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
      <section>
        <button onClick={() => router.back()} className="mb-8 flex items-center gap-2 text-xs font-bold text-muted hover:text-foreground"><ArrowLeft className="size-4" /> {t("back")}</button>
        <Logo compact />
        <p className="mt-10 text-[10px] font-black uppercase tracking-[.2em] text-primary-strong">{t("protected")}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-.05em]">{kind === "subscription" ? t("almostThere") : t("justForYou")}</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-muted">{checkoutLead(t, realCheckout, methods.expay, methods.stripe)}</p>

        <div className="mt-7 flex items-center gap-4 rounded-[24px] border border-black/5 bg-white/60 p-4 dark:bg-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={creator.avatar} alt={creator.name} className="size-16 rounded-[20px] object-cover" />
          <div className="min-w-0 flex-1"><p className="text-xs font-extrabold">{kind === "subscription" ? t("subscriptionOf", { name: creator.name }) : specialRequest ? t("requestFor", { name: creator.name }) : t("contentOf", { name: creator.name })}</p><p data-testid="checkout-plan" className="mt-1 text-[9px] text-muted">{kind === "subscription" ? `${catalogPlan?.name ?? plan.name}` : message ? t("exclusiveMessage") : pack ? (catalogPack?.name ?? t("packFallback")) : specialRequest ? t("agreedAmount") : t("exclusivePost")}</p></div>
          <p data-testid="checkout-amount" className="text-sm font-black">{shownCents == null ? "…" : brl(shownCents)}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {realCheckout ? (
            <>
              {methods.expay && <Pill><ShieldCheck className="mr-1 size-3" /> {t("pix")}</Pill>}
              {methods.stripe && <Pill><CreditCard className="mr-1 size-3" /> {t("card")}</Pill>}
            </>
          ) : (
            <>
              <Pill><ShieldCheck className="mr-1 size-3" /> {t("demoEnv")}</Pill>
              <Pill><LockKeyhole className="mr-1 size-3" /> {t("noRealChargePill")}</Pill>
            </>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[34px] border border-black/5 bg-white/75 shadow-[0_30px_90px_rgba(32,32,39,.12)] dark:bg-white/5">
        <div className="flex items-center justify-between border-b border-black/5 p-5 sm:px-7">
          <div><p className="text-xs font-extrabold">{realCheckout ? t("paymentMethod") : t("payWithPix")}</p><p className="mt-1 text-[9px] text-muted">{methods.expay && methods.stripe ? t("methodsBoth") : realCheckout ? t("methodsReal") : t("methodsInstant")}</p></div>
          <span className="grid size-10 place-items-center rounded-2xl bg-primary/20"><Sparkles className="size-5 text-primary-strong" /></span>
        </div>
        <div className="grid place-items-center p-6 sm:p-8">
          {!realCheckout && (
            <>
              <DemoPaymentGraphic seed={`${kind}-${id}-${amount}`} label={t("simulation")} />
              <div className="mt-5 flex items-center gap-2 text-[10px] font-semibold text-muted"><Clock3 className="size-3.5" /> {t("illustrative")}</div>
              <div className="mt-5 w-full max-w-sm rounded-2xl bg-surface/65 p-3 text-center text-[9px] font-semibold text-muted dark:bg-white/5">
                {t("pixPayment")}
              </div>
            </>
          )}
          {realCheckout && (
            <p className="mb-2 text-3xl font-black tracking-[-.04em]">{shownCents == null ? "…" : brl(shownCents)}</p>
          )}
          {quote.needsAuth ? (
            <Link href={signInHref} className="mb-4 block max-w-sm cursor-pointer text-center text-sm font-semibold text-accent-strong underline underline-offset-4 hover:opacity-80">
              {t("signInToPay")}
            </Link>
          ) : quoteError ? (
            <p className="mb-4 max-w-sm text-center text-sm text-accent-strong">{quoteError}</p>
          ) : null}
          {realCheckout ? (
            <div className="mt-5 grid w-full max-w-sm grid-cols-2 gap-3">
              {methods.expay && (
                <Button size="lg" className={methods.stripe ? "w-full" : "col-span-2 w-full"} onClick={() => setPixOpen(true)} disabled={quotedCents == null}>
                  {t("payPix")}
                </Button>
              )}
              {methods.stripe && (
                <Button size="lg" variant="outline" className={methods.expay ? "w-full" : "col-span-2 w-full"} onClick={() => setCardOpen(true)} disabled={quotedCents == null}>
                  <CreditCard className="size-4" /> {t("card")}
                </Button>
              )}
            </div>
          ) : (
            <Button size="lg" className="mt-5 w-full max-w-sm" onClick={simulate} disabled={paying}>
              {paying ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
              {paying ? t("confirming") : t("simulate")}
            </Button>
          )}
          <p className="mt-4 max-w-xs text-center text-[9px] leading-4 text-muted">{checkoutFoot(t, methods.expay, methods.stripe)}</p>
        </div>
      </section>
      {pixOpen && <ExpayCheckoutModal
        title={kind === "subscription" ? t("subscriptionOf", { name: creator.name }) : t("contentOf", { name: creator.name })}
        purpose={purpose}
        creatorId={quoteCreatorId}
        subjectId={subjectId}
        idempotencyKey={pixKey}
        onAmount={rememberAmount}
        onClose={() => setPixOpen(false)}
        onPaid={() => {
          setPixOpen(false);
          if (!paid) grantLocalAccess("pix");
        }}
      />}
      {cardOpen && <StripeCheckoutModal
        title={kind === "subscription" ? t("subscriptionOf", { name: creator.name }) : t("contentOf", { name: creator.name })}
        purpose={purpose}
        creatorId={quoteCreatorId}
        subjectId={subjectId}
        idempotencyKey={cardKey}
        publishableKey={methods.stripePublishableKey}
        onAmount={rememberAmount}
        onClose={() => setCardOpen(false)}
        onPaid={() => {
          setCardOpen(false);
          if (!paid) grantLocalAccess("card");
        }}
      />}
    </div>
  );
}

function checkoutLead(t: ReturnType<typeof useTranslations<"checkout">>, real: boolean, expay: boolean, stripe: boolean) {
  if (!real) return t("leadDemo");
  if (expay && stripe) return t("leadBoth");
  if (expay) return t("leadPix");
  return t("leadCard");
}

function checkoutFoot(t: ReturnType<typeof useTranslations<"checkout">>, expay: boolean, stripe: boolean) {
  if (expay && stripe) return t("footBoth");
  if (stripe) return t("footCard");
  return t("footPix");
}

export default function CheckoutPage() {
  return <Suspense fallback={<div className="m-8 h-[75vh] rounded-[34px] skeleton" />}><CheckoutContent /></Suspense>;
}
