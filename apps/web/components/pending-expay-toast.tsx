"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clearPendingExpayCharge, pendingChargeOutcome, readPendingExpayCharge } from "@/lib/pix-poll";

export const PAYMENT_CONFIRMED_EVENT = "patrocino:payment-confirmed";

export function publishPaymentConfirmed(chargeId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAYMENT_CONFIRMED_EVENT, { detail: { chargeId } }));
}

export function PendingExpayToast() {
  const pathname = usePathname();
  const t = useTranslations("checkout");
  const toasted = useRef(new Set<string>());

  useEffect(() => {
    let stop = false;
    let inflight = false;

    async function check() {
      if (stop || inflight) return;
      const pending = readPendingExpayCharge(window.localStorage);
      if (!pending) return;
      inflight = true;
      try {
        const response = await fetch(`/api/payments/expay/charges/${encodeURIComponent(pending.chargeId)}`, { cache: "no-store" });
        if (!response.ok || stop) return;
        const charge = (await response.json()) as { status?: string; accessActive?: boolean };
        const outcome = pendingChargeOutcome(charge);
        if (outcome === "pending") return;
        clearPendingExpayCharge(window.localStorage, pending.chargeId);
        if (outcome !== "confirmed" || toasted.current.has(pending.chargeId)) return;
        toasted.current.add(pending.chargeId);
        toast.success(t("confirmedPayment"));
        publishPaymentConfirmed(pending.chargeId);
      } catch {
        // The next visit or focus retries. The server sync does not depend on this tab.
      } finally {
        inflight = false;
      }
    }

    function onVisible() {
      if (document.visibilityState === "hidden") return;
      void check();
    }

    void check();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, t]);

  return null;
}
