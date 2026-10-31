"use client";

import { useMoney } from "@/lib/visitor-currency";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { apiErrorText } from "@/lib/api-error";

type SubscriptionItem = {
  id: string;
  creatorName: string;
  creatorUsername: string;
  planName: string;
  amountCents: number;
  currency?: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  access: boolean;
  simulation: boolean;
};

const statusKey = {
  ACTIVE: "statusActive",
  PENDING: "statusPending",
  PAST_DUE: "statusPastDue",
  CANCELED: "statusCanceled",
  EXPIRED: "statusExpired",
} as const;

export default function SubscriptionsPage() {
  const money = useMoney();
  const t = useTranslations("billing");
  const errors = useTranslations("errors");
  const locale = useLocale();
  const [items, setItems] = useState<SubscriptionItem[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/subscriptions/me", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { items?: SubscriptionItem[]; code?: unknown; message?: unknown };
    if (response.status === 401) {
      setError(t("signIn"));
      setItems([]);
      return;
    }
    if (!response.ok) {
      setError(apiErrorText(data, errors, t("loadFailed")));
      setItems([]);
      return;
    }
    setItems(data.items ?? []);
  }, [errors, t]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load().catch(() => {
        setError(t("loadFailed"));
        setItems([]);
      });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [load, t]);

  async function cancel(id: string) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`/api/subscriptions/${id}/cancel`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
      if (!response.ok) {
        setError(apiErrorText(data, errors, t("cancelFailed")));
        return;
      }
      await load();
    } catch {
      setError(t("cancelFailed"));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-primary-strong">{t("eyebrow")}</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-.04em]">{t("mine")}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{t("body")}</p>
      {error && <p className="mt-4 rounded-2xl bg-accent/25 px-4 py-3 text-sm">{error}</p>}
      {items === null && <p className="mt-8 text-sm text-muted">{t("loading")}</p>}
      {items?.length === 0 && !error && (
        <p className="mt-8 text-sm text-muted">{t("empty")}</p>
      )}
      <div className="mt-6 space-y-3">
        {items?.map((item) => (
          <article key={item.id} data-testid="subscription-card" className="rounded-3xl border border-border bg-elevated p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold">{item.creatorName || item.creatorUsername}</h2>
                <p className="mt-1 text-sm text-muted">{item.planName || t("planFallback")} · {money(item.amountCents, item.currency === "USD" ? "USD" : "BRL")}</p>
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary-strong">
                {item.status in statusKey ? t(statusKey[item.status as keyof typeof statusKey]) : item.status}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted">
              {item.access ? t("accessOn") : t("accessOff")}
              {item.currentPeriodEnd ? t("until", { date: new Date(item.currentPeriodEnd).toLocaleDateString(locale) }) : ""}
              {item.simulation ? t("localSimulation") : ""}
              {item.cancelAtPeriodEnd ? t("cancelsAtEnd") : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.creatorUsername && (
                <Link href={`/creator/${item.creatorUsername}`} className="inline-flex h-9 items-center rounded-full border border-border px-4 text-xs font-bold">
                  {t("viewProfile")}
                </Link>
              )}
              {item.status === "ACTIVE" && !item.cancelAtPeriodEnd && (
                <Button data-testid="subscription-cancel" size="sm" variant="outline" disabled={busy === item.id} onClick={() => void cancel(item.id)}>
                  {busy === item.id ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  {t("cancel")}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
