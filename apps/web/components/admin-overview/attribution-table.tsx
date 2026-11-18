"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@mimelux/core/currency";
import { Panel } from "@/components/admin-overview/primitives";

type Row = {
  id: string;
  createdAt: string;
  kind: string;
  amountCents: number;
  currency: string;
  username: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
};

const KINDS = ["SUBSCRIPTION", "POST", "MESSAGE", "PACK", "SPECIAL_REQUEST"];

export function AttributionTable() {
  const t = useTranslations("adminOverview");
  const locale = useLocale();
  const [items, setItems] = useState<Row[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/attribution", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { items?: Row[] };
        setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setItems([]);
      });
    return () => controller.abort();
  }, []);

  function download() {
    if (!items?.length) return;
    const header = ["createdAt", "kind", "currency", "amount", "username", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    const lines = items.map((row) =>
      [row.createdAt, row.kind, row.currency, (row.amountCents / 100).toFixed(2), row.username, row.utmSource, row.utmMedium, row.utmCampaign, row.utmContent, row.utmTerm]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "patrocino-utm.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel title={t("utmTitle")} subtitle={t("utmHint")} testId="utm-sales">
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={download} disabled={!items?.length} className="min-h-10 rounded-lg bg-white/10 px-3 text-xs font-semibold disabled:opacity-40">
          {t("utmDownload")}
        </button>
      </div>
      {items && items.length === 0 ? (
        <p className="text-sm text-muted">{t("utmEmpty")}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted">
                <th className="pb-2 font-medium">{t("utmWhen")}</th>
                <th className="pb-2 font-medium">{t("utmType")}</th>
                <th className="pb-2 font-medium">{t("utmCreator")}</th>
                <th className="pb-2 text-right font-medium">{t("utmValue")}</th>
                <th className="pb-2 font-medium">{t("utmSource")}</th>
                <th className="pb-2 font-medium">{t("utmCampaign")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {(items ?? []).slice(0, 20).map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-2 text-xs text-muted">{new Date(row.createdAt).toLocaleString(locale, { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="py-2 pr-2">{KINDS.includes(row.kind) ? t(`type.${row.kind}`) : row.kind}</td>
                  <td className="py-2 pr-2">{row.username}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(row.amountCents, row.currency === "USD" ? "USD" : "BRL", locale)}</td>
                  <td className="py-2 pr-2">{row.utmSource || "—"}{row.utmMedium ? ` / ${row.utmMedium}` : ""}</td>
                  <td className="py-2">{row.utmCampaign || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
