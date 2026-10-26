"use client";

import { useEffect, useState } from "react";
import { Check, Copy, LoaderCircle, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@mimelux/ui";
import { Input } from "@/components/ui/input";

type ChargeView = {
  chargeId: string;
  status: string;
  accessActive: boolean;
  billingMode: string;
  copiaECola: string | null;
  qrCode: string | null;
  amountCents: number;
};

const terminal = new Set(["paid", "failed", "refunded", "canceled", "expired"]);

export function ExpayCheckoutModal({
  amountCents,
  title,
  purpose,
  buyerId,
  creatorId,
  subjectId,
  description,
  idempotencyKey,
  onClose,
  onPaid,
}: {
  amountCents: number;
  title: string;
  purpose: "subscription" | "post" | "message" | "pack" | "special_request";
  buyerId: string;
  creatorId: string;
  subjectId: string;
  description: string;
  idempotencyKey: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const asksForDocument = purpose === "subscription";
  const [documentInput, setDocumentInput] = useState("");
  const [payerDocument, setPayerDocument] = useState<string | null>(asksForDocument ? null : "");
  const [charge, setCharge] = useState<ChargeView | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3334/v1";

  useEffect(() => {
    if (payerDocument === null) return;
    let stop = false;
    const controller = new AbortController();

    async function start() {
      try {
        const response = await fetch(`${apiBase}/payments/expay/charges`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            buyerId,
            creatorId,
            purpose,
            subjectId,
            amountCents,
            description,
            idempotencyKey,
            customer: {
              name: "Apoiador",
              email: "fan@patrocino.com",
              ...(payerDocument ? { document: payerDocument } : {}),
            },
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as Partial<ChargeView> & { message?: string };
        if (!response.ok || !payload.chargeId) {
          if (!stop) setError(payload.message || "Não foi possível gerar o Pix.");
          return;
        }
        if (!stop) setCharge(payload as ChargeView);
      } catch {
        if (!stop) setError("Não foi possível gerar o Pix.");
      }
    }

    void start();
    return () => {
      stop = true;
      controller.abort();
    };
  }, [amountCents, apiBase, buyerId, creatorId, purpose, subjectId, description, idempotencyKey, payerDocument]);

  useEffect(() => {
    if (!charge?.chargeId || terminal.has(charge.status)) return;
    let stop = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${apiBase}/payments/expay/charges/${charge.chargeId}`);
        if (!response.ok) return;
        const next = (await response.json()) as ChargeView;
        if (stop) return;
        setCharge(next);
        if (next.status === "paid" || next.accessActive) onPaid();
      } catch {
        // The next poll retries. The webhook remains the server confirmation.
      }
    }, 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [charge?.chargeId, charge?.status, apiBase, onPaid]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copia = charge?.copiaECola;
  const paid = charge?.status === "paid" || charge?.accessActive;

  function generatePix() {
    const cleaned = documentInput.replace(/\D/g, "");
    if (cleaned && cleaned.length !== 11 && cleaned.length !== 14) {
      setError("Informe um CPF com 11 dígitos ou um CNPJ com 14, ou deixe em branco para pagar só este mês.");
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
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-primary-strong">Pix</p>
          <button type="button" aria-label="Fechar" onClick={onClose} className="grid size-10 place-items-center rounded-full hover:bg-black/5">
            <X className="size-4" />
          </button>
        </div>
        <h2 id="expay-title" className="text-2xl font-extrabold tracking-[-.04em]">{paid ? "Pagamento confirmado" : "Pague com Pix"}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{title}</p>

        {error && <p className="mt-5 rounded-2xl bg-accent/15 px-4 py-3 text-sm text-accent-strong">{error}</p>}

        {asksForDocument && payerDocument !== null && error && !charge && (
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => { setError(""); setPayerDocument(null); }}>
            Tentar de novo
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
            <label htmlFor="expay-document" className="block text-sm font-semibold">CPF ou CNPJ do pagador</label>
            <Input
              id="expay-document"
              inputMode="numeric"
              autoComplete="off"
              value={documentInput}
              onChange={(event) => setDocumentInput(event.target.value)}
              placeholder="000.000.000-00"
              className="h-12 rounded-2xl px-4 text-base"
            />
            <p className="text-xs leading-5 text-muted">Sem ele, o Pix automático não abre e o mês segue avulso.</p>
            <Button type="submit" className="w-full">Gerar Pix</Button>
          </form>
        )}

        {payerDocument !== null && !charge && !error && (
          <div className="grid place-items-center py-16 text-muted">
            <LoaderCircle className="size-6 animate-spin" />
            <p className="mt-3 text-xs">Gerando o código Pix</p>
          </div>
        )}

        {charge && paid && (
          <div className="mt-6 grid place-items-center rounded-[24px] bg-emerald-500/10 px-5 py-10 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-600"><Check className="size-7" /></span>
            <p className="mt-4 text-sm font-semibold">O acesso já está liberado.</p>
          </div>
        )}

        {charge && !paid && (
          <div className="mt-5">
            {charge.billingMode === "pix_monthly_fallback" && (
              <p className="mb-4 rounded-2xl bg-surface px-4 py-3 text-xs leading-5 text-muted">
                O débito automático não ficou disponível. Este Pix cobre o mês atual.
              </p>
            )}
            <div className="grid place-items-center rounded-[24px] bg-white p-4">
              {copia ? (
                <QRCodeSVG value={copia} size={196} includeMargin />
              ) : charge.qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={charge.qrCode} alt="" className="size-48 object-contain" />
              ) : (
                <p className="px-4 py-10 text-center text-sm text-muted">A ExPay não devolveu o código Pix.</p>
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
                  <Copy className="size-4" /> {copied ? "Código copiado" : "Copiar código"}
                </Button>
              </>
            )}
            <p data-testid="expay-status" className="mt-4 text-center text-xs text-muted">
              {charge.status === "expired" ? "Este Pix expirou." : charge.status === "failed" || charge.status === "canceled" ? "O pagamento não foi concluído." : "Aguardando o pagamento"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
