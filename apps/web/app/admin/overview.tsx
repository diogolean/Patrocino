"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type Money = Record<string, number>;
export type Overview = {
  generatedAt: string;
  revenue: { today: Money; d7: Money; d30: Money; allTime: Money };
  byProvider: Record<string, Money>;
  byType: Record<string, { count: number; amount: Money }>;
  subscriptions: { active: number; mrr: Money; new30: number; churned30: number };
  funnel: { visits: number | null; clicks30: number; signups30: number; attributedSignups30: number; buyers30: number; sales30: number; clickToSignup: number; signupToBuyer: number };
  topCreators: { id: string; name: string; username: string; revenue30: Money; sales30: number; activeSubs: number; videos: number; photos: number }[];
  affiliates: { id: string; name: string; clicks: number; sales: number; pending: Money; paid: Money }[];
  health: { pixPending: { count: number; amount: Money }; pixFailed30: number; purchasesFailed30: number; purchasesStuck: number; refunded30: number };
};

export function moneyText(money: Money, locale: string) {
  const parts = Object.entries(money)
    .filter(([, cents]) => cents)
    .sort(([a], [b]) => (a === "BRL" ? -1 : b === "BRL" ? 1 : a.localeCompare(b)))
    .map(([currency, cents]) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100));
  return parts.length ? parts.join(" · ") : new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(0);
}

const card = "rounded-3xl border border-border bg-elevated/70 p-4";

function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-2xl bg-background/70 p-3" data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-base font-extrabold leading-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function ExecutiveOverview() {
  const t = useTranslations("adminOverview");
  const locale = useLocale();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/overview", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as Overview;
        if (alive) setData(payload);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const m = (money: Money) => moneyText(money, locale);
  const n = (value: number) => new Intl.NumberFormat(locale).format(value);
  const typeLabel = (kind: string) => (["SUBSCRIPTION", "POST", "MESSAGE", "PACK", "SPECIAL_REQUEST"].includes(kind) ? t(`type.${kind}`) : kind);

  return (
    <section data-testid="executive-overview" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-8">
      <div>
        <h1 className="text-xl font-extrabold tracking-[-.03em]">{t("title")}</h1>
        <p className="text-xs text-muted">{data ? t("updated", { time: new Date(data.generatedAt).toLocaleString(locale, { timeZone: "America/Sao_Paulo" }) }) : failed ? t("failed") : t("loading")}</p>
      </div>
      {data && (
        <>
          <div className={card}>
            <h2 className="text-sm font-extrabold">{t("revenue")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat testId="rev-today" label={t("today")} value={m(data.revenue.today)} />
              <Stat label={t("d7")} value={m(data.revenue.d7)} />
              <Stat testId="rev-30" label={t("d30")} value={m(data.revenue.d30)} />
              <Stat label={t("allTime")} value={m(data.revenue.allTime)} />
              <Stat testId="mrr" label={t("mrr")} value={m(data.subscriptions.mrr)} />
              <Stat label={t("activeSubs")} value={n(data.subscriptions.active)} />
              <Stat label={t("newSubs")} value={n(data.subscriptions.new30)} hint={t("last30")} />
              <Stat label={t("churned")} value={n(data.subscriptions.churned30)} hint={t("last30")} />
            </div>
            <h3 className="mt-4 text-xs font-bold text-muted">{t("byProvider")}</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {Object.keys(data.byProvider).length === 0 && <p className="text-xs text-muted">{t("none")}</p>}
              {Object.entries(data.byProvider).map(([provider, money]) => (
                <Stat key={provider} label={t(`provider.${provider === "stripe" || provider === "pix" ? provider : "other"}`)} value={m(money)} hint={t("last30")} />
              ))}
            </div>
          </div>

          <div className={card}>
            <h2 className="text-sm font-extrabold">{t("salesByType")} <span className="font-normal text-muted">· {t("last30")}</span></h2>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {Object.keys(data.byType).length === 0 && <p className="text-xs text-muted">{t("none")}</p>}
              {Object.entries(data.byType).map(([kind, row]) => (
                <Stat key={kind} label={typeLabel(kind)} value={m(row.amount)} hint={t("salesCount", { count: row.count })} />
              ))}
            </div>
          </div>

          <div className={card}>
            <h2 className="text-sm font-extrabold">{t("funnel")} <span className="font-normal text-muted">· {t("last30")}</span></h2>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
              <Stat label={t("visits")} value={data.funnel.visits == null ? "—" : n(data.funnel.visits)} hint={data.funnel.visits == null ? t("notCollected") : undefined} />
              <Stat label={t("clicks")} value={n(data.funnel.clicks30)} hint={t("affiliateLinks")} />
              <Stat label={t("signups")} value={n(data.funnel.signups30)} hint={t("attributed", { count: data.funnel.attributedSignups30 })} />
              <Stat label={t("buyers")} value={n(data.funnel.buyers30)} hint={t("salesCount", { count: data.funnel.sales30 })} />
              <Stat label={t("conversion")} value={`${data.funnel.signupToBuyer}%`} hint={t("clickToSignup", { rate: data.funnel.clickToSignup })} />
            </div>
          </div>

          <div className={card}>
            <h2 className="text-sm font-extrabold">{t("topCreators")}</h2>
            <ul className="mt-3 divide-y divide-border" data-testid="top-creators">
              {data.topCreators.map((creator, index) => (
                <li key={creator.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{index + 1}. {creator.name}</span>
                    <span className="block text-[11px] text-muted">{t("media", { videos: creator.videos, photos: creator.photos })} · {t("subsShort", { count: creator.activeSubs })}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-extrabold">{m(creator.revenue30)}</span>
                    <span className="block text-[11px] text-muted">{t("salesCount", { count: creator.sales30 })}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={card}>
            <h2 className="text-sm font-extrabold">{t("affiliates")}</h2>
            <ul className="mt-3 divide-y divide-border" data-testid="overview-affiliates">
              {data.affiliates.length === 0 && <li className="py-2 text-xs text-muted">{t("none")}</li>}
              {data.affiliates.map((affiliate) => (
                <li key={affiliate.id} className="grid grid-cols-[1fr_auto] gap-x-3 py-2 text-sm">
                  <span className="truncate font-bold">{affiliate.name}</span>
                  <span className="text-right text-[11px] text-muted">{t("clicksSales", { clicks: affiliate.clicks, sales: affiliate.sales })}</span>
                  <span className="text-[11px] text-muted">{t("pending")}: <b className="text-foreground">{m(affiliate.pending)}</b></span>
                  <span className="text-right text-[11px] text-muted">{t("paid")}: {m(affiliate.paid)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={card}>
            <h2 className="text-sm font-extrabold">{t("health")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
              <Stat label={t("pixPending")} value={n(data.health.pixPending.count)} hint={m(data.health.pixPending.amount)} />
              <Stat label={t("pixFailed")} value={n(data.health.pixFailed30)} hint={t("last30")} />
              <Stat label={t("failed30")} value={n(data.health.purchasesFailed30)} hint={t("last30")} />
              <Stat label={t("stuck")} value={n(data.health.purchasesStuck)} hint={t("stuckHint")} />
              <Stat label={t("refunded")} value={n(data.health.refunded30)} hint={t("last30")} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
