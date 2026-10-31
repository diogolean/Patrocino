"use client";

import { useMoney } from "@/lib/visitor-currency";
import { useEffect, useRef, useState } from "react";
import { Copy, LoaderCircle, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { apiErrorText } from "@/lib/api-error";
import { Input } from "@/components/ui/input";
import { PixPaidState, PixWaitingNotice } from "@/components/pix-waiting-notice";
import { publishPaymentConfirmed } from "@/components/pending-expay-toast";
import {
  clearPendingExpayCharge,
  isExpayTerminalStatus,
  pixPollDelay,
  rememberPendingExpayCharge,
} from "@/lib/pix-poll";

type ChargeView = {
  chargeId: string;
  status: string;
  accessActive: boolean;
  billingMode: string;
  copiaECola: string | null;
  qrCode: string | null;
  amountCents: number;
};

export function ExpayCheckoutModal({
  title,
  purpose,
  creatorId,
  subjectId,
  idempotencyKey,
  onClose,
  onPaid,
  onAmount,
}: {
  title: string;
  purpose: "subscription" | "post" | "message" | "pack" | "special_request";
  creatorId: string;
  subjectId: string;
  idempotencyKey: string;
  onClose: () => void;
  onPaid: () => void;
  onAmount?: (amountCents: number) => void;
}) {
  const money = useMoney();
  const t = useTranslations("checkout");
  const errors = useTranslations("errors");
  const closeLabel = useTranslations("dialog")("close");
  const asksForDocument = purpose === "subscription";
  const [documentInput, setDocumentInput] = useState("");
  const [payerDocument, setPayerDocument] = useState<string | null>(asksForDocument ? null : "");
  const [charge, setCharge] = useState<ChargeView | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const onPaidRef = useRef(onPaid);
  const onAmountRef = useRef(onAmount);
  onPaidRef.current = onPaid;
  onAmountRef.current = onAmount;

  useEffect(() => {
    if (payerDocument === null) return;
    let stop = false;
    const controller = new AbortController();

    async function start() {
      try {
        const response = await fetch("/api/payments/expay/charges", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            creatorId,
            purpose,
            subjectId,
            idempotencyKey,
            customer: payerDocument ? { document: payerDocument } : undefined,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as Partial<ChargeView> & { code?: unknown; message?: unknown };
        if (!response.ok || !payload.chargeId || typeof payload.amountCents !== "number") {
          if (!stop) setError(apiErrorText(payload, errors, t("pixFailed")));
          return;
        }
        if (!stop) {
          const next = payload as ChargeView;
          setCharge(next);
          onAmount?.(next.amountCents);
          if (next.accessActive || isExpayTerminalStatus(next.status)) clearPendingExpayCharge(window.localStorage, next.chargeId);
          else rememberPendingExpayCharge(window.localStorage, next.chargeId);
        }
      } catch {
        if (!stop) setError(t("pixFailed"));
      }
    }

    void start();
    return () => {
      stop = true;
      controller.abort();
    };
  }, [creatorId, purpose, subjectId, idempotencyKey, onAmount, payerDocument, errors, t]);

  useEffect(() => {
    if (!charge?.chargeId || charge.accessActive || isExpayTerminalStatus(charge.status)) return;
    const chargeId = charge.chargeId;
    let stop = false;
    let timer = 0;
    let inflight = false;
    const started = Date.now();

    async function poll() {
      if (stop || inflight) return;
      inflight = true;
      let finished = false;
      try {
        const response = await fetch(`/api/payments/expay/charges/${encodeURIComponent(chargeId)}`, { cache: "no-store" });
        if (response.ok && !stop) {
          const next = (await response.json()) as ChargeView;
          setCharge(next);
          if (typeof next.amountCents === "number") onAmountRef.current?.(next.amountCents);
          if (next.accessActive) {
            clearPendingExpayCharge(window.localStorage, chargeId);
            publishPaymentConfirmed(chargeId);
            finished = true;
          } else if (isExpayTerminalStatus(next.status)) {
            clearPendingExpayCharge(window.localStorage, chargeId);
            finished = true;
          } else {
            rememberPendingExpayCharge(window.localStorage, chargeId);
          }
        }
      } catch {
        // The next poll retries. Server sync does not depend on this tab.
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

    schedule();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [charge?.chargeId, charge?.status, charge?.accessActive]);

  function requestClose() {
    if (charge?.accessActive) onPaidRef.current();
    onClose();
  }
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") requestCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copia = charge?.copiaECola;
  const paid = Boolean(charge?.accessActive);
  const amountMismatch = charge?.status === "paid" && !charge.accessActive;

  function generatePix() {
    const cleaned = documentInput.replace(/\D/g, "");
    if (cleaned && cleaned.length !== 11 && cleaned.length !== 14) {
      setError(t("documentInvalid"));
      return;
    }
    setError("");
    setPayerDocument(cleaned);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 sm:items-center sm:p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expay-title"
        data-testid="expay-checkout"
        className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-background px-5 pb-8 pt-4 shadow-2xl sm:max-w-md sm:rounded-[28px] sm:px-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-primary-strong">{t("pix")}</p>
          <button type="button" aria-label={closeLabel} onClick={requestClose} className="grid size-10 place-items-center rounded-full hover:bg-black/5">
            <X className="size-4" />
          </button>
        </div>
        <h2 id="expay-title" className="text-2xl font-extrabold tracking-[-.04em]">{paid ? t("confirmedPayment") : t("payWithPix")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{title}</p>
        {charge && <p data-testid="expay-amount" className="mt-3 text-lg font-black">{money(charge.amountCents, "BRL")}</p>}

        {error && <p className="mt-5 rounded-2xl bg-accent/15 px-4 py-3 text-sm text-accent-strong">{error}</p>}
        {amountMismatch && <p className="mt-5 rounded-2xl bg-accent/15 px-4 py-3 text-sm text-accent-strong">{t("mismatch")}</p>}

        {asksForDocument && payerDocument !== null && error && !charge && (
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => { setError(""); setPayerDocument(null); }}>
            {t("retry")}
          </Button>
        )}

        {payerDocument === null && (
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              generatePix();
            }}
          >
            <label htmlFor="expay-document" className="block text-sm font-semibold">{t("documentLabel")}</label>
            <Input
              id="expay-document"
              inputMode="numeric"
              autoComplete="off"
              value={documentInput}
              onChange={(event) => setDocumentInput(event.target.value)}
              placeholder="000.000.000-00"
              className="h-12 rounded-2xl px-4 text-base"
            />
            <p className="text-xs leading-5 text-muted">{t("documentHint")}</p>
            <Button type="submit" className="w-full">{t("generatePix")}</Button>
          </form>
        )}

        {payerDocument !== null && !charge && !error && (
          <div className="grid place-items-center py-16 text-muted">
            <LoaderCircle className="size-6 animate-spin" />
            <p className="mt-3 text-xs">{t("generating")}</p>
          </div>
        )}

        {charge && paid && <PixPaidState onContinue={() => onPaidRef.current()} />}

        {charge && !paid && (
          <div className="mt-5">
            {!isExpayTerminalStatus(charge.status) && (
              <div className="mb-4">
                <PixWaitingNotice />
              </div>
            )}
            {charge.billingMode === "pix_monthly_fallback" && (
              <p className="mb-4 rounded-2xl bg-surface px-4 py-3 text-xs leading-5 text-muted">
                {t("monthlyFallback")}
              </p>
            )}
            <div className="grid place-items-center rounded-[24px] bg-white p-4">
              {copia ? (
                <QRCodeSVG value={copia} size={196} includeMargin />
              ) : charge.qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={charge.qrCode} alt="" className="size-48 object-contain" />
              ) : (
                <p className="px-4 py-10 text-center text-sm text-muted">{t("missingCode")}</p>
              )}
            </div>
            {copia && (
              <>
                <p data-testid="expay-copia-e-cola" className="mt-4 break-all rounded-2xl bg-surface px-3 py-3 text-[11px] leading-5 text-muted">{copia}</p>
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={() => {
                    void navigator.clipboard.writeText(copia).then(() => setCopied(true));
                  }}
                >
                  <Copy className="size-4" /> {copied ? t("copied") : t("copyCode")}
                </Button>
              </>
            )}
            {(charge.status === "expired" || charge.status === "failed" || charge.status === "canceled") && (
              <p data-testid="expay-status" className="mt-4 text-center text-xs text-muted">
                {charge.status === "expired" ? t("expired") : t("notCompleted")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
