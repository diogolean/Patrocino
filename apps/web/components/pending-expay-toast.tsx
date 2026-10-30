"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { toast } from "sonner";
import { playMessageSound, unlockMessageSound } from "@/lib/message-sound";
import { resumeStoredPush } from "@/lib/push-browser";
import {
  clearPendingExpayCharge,
  paymentAlertsToShow,
  pixPollDelay,
  readPendingExpayCharge,
  readSeenPaymentAlerts,
  rememberSeenPaymentAlert,
  type AlertCharge,
} from "@/lib/pix-poll";

export const PAYMENT_CONFIRMED_EVENT = "patrocino:payment-confirmed";

export function publishPaymentConfirmed(chargeId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAYMENT_CONFIRMED_EVENT, { detail: { chargeId } }));
}

async function loadRemoteAlerts(): Promise<AlertCharge[]> {
  const response = await fetch("/api/payments/expay/alerts", { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json().catch(() => ({}))) as { items?: AlertCharge[] };
  return (data.items ?? []).filter((item) => typeof item.chargeId === "string");
}

async function loadCharge(chargeId: string): Promise<AlertCharge | null> {
  const response = await fetch(`/api/payments/expay/charges/${encodeURIComponent(chargeId)}`, { cache: "no-store" });
  if (!response.ok) return null;
  const charge = (await response.json().catch(() => ({}))) as { status?: string; accessActive?: boolean };
  if (typeof charge.status !== "string") return null;
  return { chargeId, status: charge.status, accessActive: charge.accessActive === true };
}

function acknowledge(chargeId: string) {
  void fetch(`/api/payments/expay/alerts/${encodeURIComponent(chargeId)}/seen`, { method: "POST" }).catch(() => undefined);
}

export function PendingExpayToast() {
  const pathname = usePathname();
  const t = useTranslations("checkout");
  const dock = useTranslations("dialog");
  const title = t("confirmedAccess");
  const detail = t("accessReady");
  const closeLabel = dock("close");
  const copy = useRef({ title, detail, closeLabel });
  copy.current = { title, detail, closeLabel };

  useEffect(() => {
    const unlock = () => unlockMessageSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    void resumeStoredPush();
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    let stop = false;
    let timer = 0;
    let inflight = false;
    const started = Date.now();
    const shown = new Set<string>();

    function showAlert(chargeId: string) {
      if (shown.has(chargeId) || readSeenPaymentAlerts(window.localStorage).has(chargeId)) return;
      shown.add(chargeId);
      rememberSeenPaymentAlert(window.localStorage, chargeId);
      clearPendingExpayCharge(window.localStorage, chargeId);
      acknowledge(chargeId);
      publishPaymentConfirmed(chargeId);
      void playMessageSound();
      window.addEventListener("pointerdown", () => void playMessageSound(), { once: true });
      const text = copy.current;
      toast.custom(
        () => (
          <div
            data-testid="payment-confirmed-alert"
            role="status"
            className="flex w-[min(100vw-2rem,340px)] items-start gap-3 rounded-2xl border border-border bg-elevated p-4 text-left shadow-xl"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-lg font-black text-emerald-600">✓</span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-extrabold leading-5 text-foreground">{text.title}</span>
              <span className="mt-1 block text-[15px] leading-5 text-muted">{text.detail}</span>
            </span>
            <button
              type="button"
              aria-label={text.closeLabel}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface"
              onClick={() => toast.dismiss(`payment-confirmed:${chargeId}`)}
            >
              <X className="size-4" />
            </button>
          </div>
        ),
        { id: `payment-confirmed:${chargeId}`, duration: Number.POSITIVE_INFINITY },
      );
    }

    async function check() {
      if (stop || inflight) return;
      inflight = true;
      let keepWatching = false;
      try {
        const storedRecord = readPendingExpayCharge(window.localStorage);
        const remote = await loadRemoteAlerts();
        const ids = new Set<string>(remote.map((item) => item.chargeId));
        if (storedRecord) ids.add(storedRecord.chargeId);
        const refreshed = new Map<string, AlertCharge>();
        for (const chargeId of ids) {
          if (stop) return;
          const live = await loadCharge(chargeId);
          if (live) refreshed.set(chargeId, live);
        }
        const storedLive = storedRecord ? refreshed.get(storedRecord.chargeId) : undefined;
        const stored = storedLive
          ? storedLive
          : storedRecord && !remote.some((item) => item.chargeId === storedRecord.chargeId)
            ? { chargeId: storedRecord.chargeId, status: "pending", accessActive: false }
            : null;
        const mergedRemote = remote.map((item) => refreshed.get(item.chargeId) ?? item);
        const plan = paymentAlertsToShow({
          stored,
          remote: mergedRemote,
          seen: readSeenPaymentAlerts(window.localStorage),
        });
        for (const chargeId of plan.confirm) showAlert(chargeId);
        if (stored && !plan.watch.includes(stored.chargeId) && !plan.confirm.includes(stored.chargeId)) {
          clearPendingExpayCharge(window.localStorage, stored.chargeId);
        }
        keepWatching = plan.watch.length > 0;
      } catch {
        keepWatching = Boolean(readPendingExpayCharge(window.localStorage));
      } finally {
        inflight = false;
      }
      if (stop || !keepWatching) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), pixPollDelay(Date.now() - started));
    }

    function wake() {
      if (document.visibilityState === "hidden" || inflight) return;
      window.clearTimeout(timer);
      void check();
    }

    void check();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [pathname]);

  return null;
}
