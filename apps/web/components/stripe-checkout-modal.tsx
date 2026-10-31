"use client";

import { useMoney } from "@/lib/visitor-currency";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CreditCard, LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { apiErrorText } from "@/lib/api-error";
import { publishPaymentConfirmed } from "@/components/pending-expay-toast";
import { PixPaidState, PixWaitingNotice } from "@/components/pix-waiting-notice";
import { pixPollDelay } from "@/lib/pix-poll";

const stripeCache = new Map<string, ReturnType<typeof loadStripe>>();

function stripePromise(publishableKey: string) {
  const cached = stripeCache.get(publishableKey);
  if (cached) return cached;
  const created = loadStripe(publishableKey);
  stripeCache.set(publishableKey, created);
  return created;
}

export function StripeCheckoutModal({
  title,
  purpose,
  creatorId,
  subjectId,
  idempotencyKey,
  publishableKey,
  onClose,
  onPaid,
  onAmount,
}: {
  title: string;
  purpose: "subscription" | "post" | "message" | "pack" | "special_request";
  creatorId: string;
  subjectId: string;
  idempotencyKey: string;
  publishableKey: string;
  onClose: () => void;
  onPaid: () => void;
  onAmount?: (amountCents: number) => void;
}) {
  const t = useTranslations("checkout");
  const errors = useTranslations("errors");
  const closeLabel = useTranslations("dialog")("close");
  const [clientSecret, setClientSecret] = useState("");
  const [chargedCents, setChargedCents] = useState<number | null>(null);
  const [chargedCurrency, setChargedCurrency] = useState<"BRL" | "USD">("USD");
  const money = useMoney();
  const [error, setError] = useState("");
  const confirmedRef = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const stripe = useMemo(() => (publishableKey ? stripePromise(publishableKey) : null), [publishableKey]);

  function requestClose() {
    if (confirmedRef.current) onPaidRef.current();
    onClose();
  }
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!publishableKey) return;
    let stop = false;
    const controller = new AbortController();

    async function start() {
      try {
        const response = await fetch("/api/payments/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            provider: "stripe",
            purpose,
            creatorId,
            subjectId,
            idempotencyKey,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { clientSecret?: string | null; amountCents?: number; currency?: unknown; code?: unknown; message?: unknown };
        if (!response.ok || !payload.clientSecret || typeof payload.amountCents !== "number") {
          if (!stop) setError(apiErrorText(payload, errors, t("cardStartFailed")));
          return;
        }
        if (!stop) {
          setChargedCents(payload.amountCents);
          setChargedCurrency(payload.currency === "BRL" ? "BRL" : "USD");
          onAmount?.(payload.amountCents);
          setClientSecret(payload.clientSecret);
        }
      } catch {
        if (!stop) setError(t("cardStartFailed"));
      }
    }

    void start();
    return () => {
      stop = true;
      controller.abort();
    };
  }, [creatorId, errors, idempotencyKey, onAmount, publishableKey, purpose, subjectId, t]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") requestCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 sm:items-center sm:p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stripe-title"
        data-testid="stripe-checkout"
        className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-background px-5 pb-8 pt-4 shadow-2xl sm:max-w-md sm:rounded-[28px] sm:px-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-primary-strong">{t("card")}</p>
          <button type="button" aria-label={closeLabel} onClick={requestClose} className="grid size-10 place-items-center rounded-full hover:bg-black/5">
            <X className="size-4" />
          </button>
        </div>
        <h2 id="stripe-title" className="text-2xl font-extrabold tracking-[-.04em]">{t("payWithCardTitle")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{title}</p>
        {chargedCents != null && <p data-testid="stripe-amount" className="mt-3 text-lg font-black">{money(chargedCents, chargedCurrency)}</p>}

        {!publishableKey && (
          <p className="mt-5 rounded-2xl bg-accent/15 px-4 py-3 text-sm text-accent-strong">
            {t("missingKey")}
          </p>
        )}
        {error && <p className="mt-5 rounded-2xl bg-accent/15 px-4 py-3 text-sm text-accent-strong">{error}</p>}
        {publishableKey && !clientSecret && !error && (
          <div className="grid place-items-center py-16 text-muted">
            <LoaderCircle className="size-6 animate-spin" />
            <p className="mt-3 text-xs">{t("preparing")}</p>
          </div>
        )}
        {stripe && clientSecret && (
          <Elements stripe={stripe} options={{ clientSecret, appearance: { theme: "stripe", variables: { borderRadius: "16px" } } }}>
            <CardPaymentForm
              clientSecret={clientSecret}
              onPaid={() => onPaidRef.current()}
              onConfirmed={() => {
                confirmedRef.current = true;
                publishPaymentConfirmed("stripe");
              }}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}

function CardPaymentForm({
  clientSecret,
  onPaid,
  onConfirmed,
}: {
  clientSecret: string;
  onPaid: () => void;
  onConfirmed: () => void;
}) {
  const t = useTranslations("checkout");
  const stripe = useStripe();
  const elements = useElements();
  const onPaidRef = useRef(onPaid);
  const onConfirmedRef = useRef(onConfirmed);
  onPaidRef.current = onPaid;
  onConfirmedRef.current = onConfirmed;
  const notConfirmedRef = useRef(t("notConfirmed"));
  notConfirmedRef.current = t("notConfirmed");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState("");
  const [phase, setPhase] = useState<"form" | "waiting" | "success">("form");
  const waiting = phase === "waiting" || (submitting && method === "pix");

  useEffect(() => {
    if (phase !== "waiting" || !stripe || !clientSecret) return;
    let stop = false;
    let timer = 0;
    let inflight = false;
    const started = Date.now();

    async function poll() {
      if (stop || inflight || !stripe) return;
      inflight = true;
      let finished = false;
      try {
        const result = await stripe.retrievePaymentIntent(clientSecret);
        const status = result.paymentIntent?.status;
        if (stop) return;
        if (status === "succeeded") {
          onConfirmedRef.current();
          setPhase("success");
          finished = true;
        } else if (status === "canceled" || status === "requires_payment_method") {
          setPhase("form");
          setError(notConfirmedRef.current);
          finished = true;
        }
      } catch {
        // The next poll retries. payment_intent.succeeded still activates access.
      } finally {
        inflight = false;
      }
      if (!stop && !finished) schedule();
    }

    function schedule() {
      window.clearTimeout(timer);
      if (stop) return;
      timer = window.setTimeout(() => void poll(), pixPollDelay(Date.now() - started));
    }

    function wake() {
      if (document.visibilityState === "hidden" || inflight) return;
      window.clearTimeout(timer);
      void poll();
    }

    void poll();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [clientSecret, phase, stripe]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || phase === "waiting") return;
    setSubmitting(true);
    setError("");
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    if (result.error) {
      setPhase("form");
      setError(result.error.message || t("cardDeclined"));
      setSubmitting(false);
      return;
    }
    const status = result.paymentIntent?.status;
    if (status === "succeeded") {
      if (method === "pix") {
        onConfirmedRef.current();
        setPhase("success");
        setSubmitting(false);
        return;
      }
      onPaidRef.current();
      return;
    }
    if (status === "processing" || status === "requires_action" || status === "requires_confirmation") {
      setPhase("waiting");
      setSubmitting(false);
      return;
    }
    setPhase("form");
    setError(t("notConfirmed"));
    setSubmitting(false);
  }

  if (phase === "success") return <PixPaidState onContinue={() => onPaidRef.current()} />;

  return (
    <form className="mt-5" onSubmit={submit}>
      {waiting && (
        <div className="mb-4">
          <PixWaitingNotice />
        </div>
      )}
      <PaymentElement
        onChange={(event) => {
          setMethod(event.value.type);
        }}
      />
      {error && <p className="mt-4 rounded-2xl bg-accent/15 px-4 py-3 text-sm text-accent-strong">{error}</p>}
      {phase !== "waiting" && (
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={!stripe || submitting}>
          {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
          {submitting ? t("confirming") : t("payWithCard")}
        </Button>
      )}
    </form>
  );
}
