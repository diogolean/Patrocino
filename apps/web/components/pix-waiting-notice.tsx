"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";

export function PixWaitingNotice() {
  const t = useTranslations("checkout");
  return (
    <div
      data-testid="pix-waiting"
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3"
    >
      <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-primary-strong" />
      <div>
        <p className="text-sm font-bold leading-5">{t("waitForConfirmation")}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{t("waitUpToTwoMinutes")}</p>
      </div>
    </div>
  );
}

export function PixPaidState({ onContinue }: { onContinue: () => void }) {
  const t = useTranslations("checkout");
  return (
    <div data-testid="pix-paid" className="mt-6 grid place-items-center rounded-[24px] bg-emerald-500/10 px-5 py-10 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
        <Check className="size-7" />
      </span>
      <p className="mt-4 text-sm font-semibold">{t("confirmedPayment")}</p>
      <p className="mt-1 text-sm text-muted">{t("accessReady")}</p>
      <Button type="button" className="mt-5 w-full" onClick={onContinue}>
        {t("seeNow")}
      </Button>
    </div>
  );
}
