"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CreditCard, LoaderCircle, X } from "lucide-react";
import { Button } from "@mimelux/ui";
import { brl } from "@/lib/gateway";

const stripeCache = new Map<string, ReturnType<typeof loadStripe>>();

function stripePromise(publishableKey: string) {
  const cached = stripeCache.get(publishableKey);
  if (cached) return cached;
  const created = loadStripe(publishableKey);
  stripeCache.set(publishableKey, created);
  return created;
}

export function StripeCheckoutModal({
  amountCents,
  title,
  description,
  idempotencyKey,
  publishableKey,
  onClose,
  onPaid,
}: {
  amountCents: number;
  title: string;
  description: string;
  idempotencyKey: string;
  publishableKey: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3334/v1";
  const stripe = useMemo(() => (publishableKey ? stripePromise(publishableKey) : null), [publishableKey]);

  useEffect(() => {
    if (!publishableKey) return;
    let stop = false;
    const controller = new AbortController();

    async function start() {
      try {
        const response = await fetch(`${apiBase}/payments/checkout`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            provider: "stripe",
            purchaseId: idempotencyKey,
            amountCents,
            description,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { clientSecret?: string | null; message?: string };
        if (!response.ok || !payload.clientSecret) {
          if (!stop) setError(payload.message || "Não foi possível iniciar o pagamento com cartão.");
          return;
        }
        if (!stop) setClientSecret(payload.clientSecret);
      } catch {
        if (!stop) setError("Não foi possível iniciar o pagamento com cartão.");
      }
    }

    void start();
    return () => {
      stop = true;
      controller.abort();
    };
  }, [amountCents, apiBase, description, idempotencyKey, publishableKey]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-primary-strong">Cartão</p>
          <button type="button" aria-label="Fechar" onClick={onClose} className="grid size-10 place-items-center rounded-full hover:bg-black/5">
            <X className="size-4" />
          </button>
        </div>
        <h2 id="stripe-title" className="text-2xl font-extrabold tracking-[-.04em]">Pague com cartão</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{title}</p>
        <p className="mt-3 text-lg font-black">{brl(amountCents)}</p>

        {!publishableKey && (
          <p className="mt-5 rounded-2xl bg-accent/15 px-4 py-3 text-sm text-accent-strong">
            O cartão não está configurado. Falta a chave publicável.
          </p>
        )}
        {error && <p className="mt-5 rounded-2xl bg-accent/15 px-4 py-3 text-sm text-accent-strong">{error}</p>}
        {publishableKey && !clientSecret && !error && (
          <div className="grid place-items-center py-16 text-muted">
            <LoaderCircle className="size-6 animate-spin" />
            <p className="mt-3 text-xs">Preparando o cartão</p>
          </div>
        )}
        {stripe && clientSecret && (
          <Elements stripe={stripe} options={{ clientSecret, appearance: { theme: "stripe", variables: { borderRadius: "16px" } } }}>
            <CardPaymentForm onPaid={onPaid} />
          </Elements>
        )}
      </div>
    </div>
  );
}

function CardPaymentForm({ onPaid }: { onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError("");
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    if (result.error) {
      setError(result.error.message || "O cartão não foi autorizado.");
      setSubmitting(false);
      return;
    }
    if (result.paymentIntent?.status === "succeeded") {
      onPaid();
      return;
    }
    setError("O pagamento ainda não foi confirmado.");
    setSubmitting(false);
  }

  return (
    <form className="mt-5" onSubmit={submit}>
      <PaymentElement />
      {error && <p className="mt-4 rounded-2xl bg-accent/15 px-4 py-3 text-sm text-accent-strong">{error}</p>}
      <Button type="submit" size="lg" className="mt-5 w-full" disabled={!stripe || submitting}>
        {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        {submitting ? "Confirmando..." : "Pagar com cartão"}
      </Button>
    </form>
  );
}
