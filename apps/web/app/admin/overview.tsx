"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { moneyText, numberText } from "@/components/admin-overview/format";
import { KpiCard } from "@/components/admin-overview/kpi-card";
import { DeltaBadge, EmptyState, MiniStat, Panel, Skeleton } from "@/components/admin-overview/primitives";
import { RangePicker } from "@/components/admin-overview/range-picker";
import { RevenueChart } from "@/components/admin-overview/revenue-chart";
import type { Money, Overview, RangeQuery } from "@/components/admin-overview/types";
import { useOverview } from "@/components/admin-overview/use-overview";

const TYPES = ["SUBSCRIPTION", "POST", "MESSAGE", "PACK", "SPECIAL_REQUEST"];

function OverviewSkeleton() {
  return (
    <div className="space-y-4" data-testid="overview-skeleton" aria-busy>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-[118px] rounded-2xl" />)}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}

function Body({ data }: { data: Overview }) {
  const t = useTranslations("adminOverview");
  const locale = useLocale();
  const m = (money: Money) => moneyText(money, locale);
  const n = (value: number) => numberText(value, locale);
  const vsPrevious = t("vsPrevious");
  const currency = data.kpis.revenue.currency;
  const pointLabel = (iso: string) =>
    new Date(iso).toLocaleString(locale, data.range.bucket === "hour" ? { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" } : { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });
  const chartPoints = data.series.map((point) => ({
    label: pointLabel(point.t),
    value: point.revenue[currency] ?? 0,
    previous: point.prevRevenue[currency] ?? 0,
    valueText: m(point.revenue),
    previousText: m(point.prevRevenue),
    sales: point.sales,
  }));
  const revenueSpark = chartPoints.map((point) => point.value);
  const salesSpark = data.series.map((point) => point.sales);
  const hasSales = data.kpis.sales.current > 0 || data.kpis.sales.previous > 0;
  const typeLabel = (kind: string) => (TYPES.includes(kind) ? t(`type.${kind}`) : kind);
  const providerTotal = Object.values(data.byProvider).reduce((sum, money) => sum + (money[currency] ?? 0), 0);
  const health = data.health;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard testId="kpi-revenue" label={t("revenue")} value={m(data.kpis.revenue.current)} delta={data.kpis.revenue.delta} deltaLabel={vsPrevious} sub={`${vsPrevious}: ${m(data.kpis.revenue.previous)}`} spark={revenueSpark} />
        <KpiCard testId="mrr" label={t("mrr")} value={m(data.kpis.mrr.current)} delta={data.kpis.mrr.delta} deltaLabel={t("vsStart")} sub={t("activeSubsCount", { count: data.subscriptions.active.current })} />
        <KpiCard testId="kpi-sales" label={t("sales")} value={n(data.kpis.sales.current)} delta={data.kpis.sales.delta} deltaLabel={vsPrevious} sub={t("buyersCount", { count: data.funnel.buyers })} spark={salesSpark} />
        <KpiCard testId="kpi-conversion" label={t("conversion")} value={`${data.kpis.conversion.current}%`} delta={data.kpis.conversion.delta} deltaUnit=" pp" deltaLabel={vsPrevious} sub={t("signupsCount", { count: data.funnel.signups.current })} />
      </div>

      <Panel title={t("revenueOverTime")} subtitle={t("chartHint")} testId="revenue-panel">
        {hasSales ? <RevenueChart points={chartPoints} previousLabel={t("previousPeriod")} salesLabel={(count) => t("salesCount", { count })} /> : <EmptyState title={t("emptySales")} hint={t("emptySalesHint")} />}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("salesByType")} testId="sales-by-type">
          {Object.keys(data.byType).length === 0 ? (
            <EmptyState title={t("none")} />
          ) : (
            <ul className="space-y-3">
              {Object.entries(data.byType)
                .sort(([, a], [, b]) => (b.amount[currency] ?? 0) - (a.amount[currency] ?? 0))
                .map(([kind, row]) => {
                  const share = data.kpis.revenue.current[currency] ? Math.round(((row.amount[currency] ?? 0) / data.kpis.revenue.current[currency]!) * 100) : 0;
                  return (
                    <li key={kind}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate text-foreground/90">{typeLabel(kind)}</span>
                        <span className="shrink-0 font-semibold tabular-nums">{m(row.amount)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} /></div>
                        <span className="w-24 text-right text-[11px] tabular-nums text-muted">{t("salesCount", { count: row.count })} · {share}%</span>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat label={t("activeSubs")} value={n(data.subscriptions.active.current)} />
            <MiniStat label={t("newSubs")} value={n(data.subscriptions.created.current)} hint={`${vsPrevious}: ${n(data.subscriptions.created.previous)}`} />
            <MiniStat label={t("churned")} value={n(data.subscriptions.churned.current)} hint={`${vsPrevious}: ${n(data.subscriptions.churned.previous)}`} tone={data.subscriptions.churned.current ? "warn" : undefined} />
          </div>
        </Panel>

        <Panel title={t("funnel")} testId="funnel">
          <ol className="space-y-2">
            {[
              { label: t("visits"), value: data.funnel.visits, hint: t("notCollected") },
              { label: t("clicks"), value: data.funnel.clicks.current, hint: t("affiliateLinks"), delta: data.funnel.clicks.delta },
              { label: t("signups"), value: data.funnel.signups.current, hint: t("attributed", { count: data.funnel.attributedSignups }), delta: data.funnel.signups.delta },
              { label: t("buyers"), value: data.funnel.buyers, hint: `${t("conversion")}: ${data.funnel.conversion.current}%` },
            ].map((step, index, steps) => {
              const top = Math.max(...steps.map((item) => item.value ?? 0), 1);
              return (
                <li key={step.label} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">{index + 1}. {step.label}</span>
                    {step.delta !== undefined && <DeltaBadge delta={step.delta} label={vsPrevious} />}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold tabular-nums">{step.value == null ? "—" : n(step.value)}</span>
                    <span className="truncate text-[11px] text-muted">{step.hint}</span>
                  </div>
                  {step.value != null && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-accent/80" style={{ width: `${Math.max(2, (step.value / top) * 100)}%` }} /></div>}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[11px] text-muted">{t("clickToSignup", { rate: data.funnel.clickToSignup })}</p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title={t("topCreators")} testId="top-creators" className="lg:col-span-3">
          {data.topCreators.length === 0 ? (
            <EmptyState title={t("none")} />
          ) : (
            <ul className="-mx-2">
              {data.topCreators.map((creator, index) => (
                <li key={creator.id}>
                  <a href={`/creator/${creator.username}`} className="flex min-h-12 touch-manipulation items-center gap-3 rounded-xl px-2 py-2 transition-colors active:bg-white/[0.08] md:hover:bg-white/[0.04]">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[11px] font-bold tabular-nums text-muted">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{creator.name}</span>
                      <span className="block truncate text-[11px] text-muted">{t("media", { videos: creator.videos, photos: creator.photos })} · {t("subsShort", { count: creator.activeSubs })}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">{m(creator.revenue)}</span>
                      <span className="block text-[11px] text-muted">{t("salesCount", { count: creator.sales })}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("byProvider")} testId="by-provider" className="lg:col-span-2">
          {Object.keys(data.byProvider).length === 0 ? (
            <EmptyState title={t("none")} />
          ) : (
            <ul className="space-y-3">
              {Object.entries(data.byProvider).map(([provider, money]) => {
                const share = providerTotal ? Math.round(((money[currency] ?? 0) / providerTotal) * 100) : 0;
                return (
                  <li key={provider}>
                    <div className="flex justify-between gap-3 text-sm"><span className="text-foreground/90">{t(`provider.${provider === "stripe" || provider === "pix" ? provider : "other"}`)}</span><span className="font-semibold tabular-nums">{m(money)}</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={t("affiliates")} subtitle={t("affiliatesHint")} testId="overview-affiliates">
        {data.affiliates.length === 0 ? (
          <EmptyState title={t("none")} />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted">
                  <th className="pb-2 font-medium">{t("affiliate")}</th>
                  <th className="pb-2 text-right font-medium">{t("clicks")}</th>
                  <th className="pb-2 text-right font-medium">{t("sales")}</th>
                  <th className="pb-2 text-right font-medium">{t("pending")}</th>
                  <th className="pb-2 text-right font-medium">{t("paid")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.affiliates.map((affiliate) => (
                  <tr key={affiliate.id} className="transition-colors md:hover:bg-white/[0.03]">
                    <td className="py-2.5 pr-2 font-medium">{affiliate.name}</td>
                    <td className="py-2.5 text-right tabular-nums">{n(affiliate.clicks)}</td>
                    <td className="py-2.5 text-right tabular-nums">{n(affiliate.sales)}</td>
                    <td className="py-2.5 text-right tabular-nums text-amber-200">{m(affiliate.pending)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{m(affiliate.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={t("health")} testId="payment-health">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <MiniStat label={t("pixPending")} value={n(health.pixPending.count)} hint={m(health.pixPending.amount)} tone={health.pixPending.count ? "warn" : undefined} />
          <MiniStat label={t("pixFailed")} value={n(health.pixFailed)} tone={health.pixFailed ? "bad" : undefined} />
          <MiniStat label={t("failed30")} value={n(health.purchasesFailed)} tone={health.purchasesFailed ? "bad" : undefined} />
          <MiniStat label={t("stuck")} value={n(health.purchasesStuck)} hint={t("stuckHint")} tone={health.purchasesStuck ? "warn" : undefined} />
          <MiniStat label={t("refunded")} value={n(health.refunded)} />
        </div>
      </Panel>
    </div>
  );
}

export function ExecutiveOverview() {
  const t = useTranslations("adminOverview");
  const locale = useLocale();
  const [range, setRange] = useState<RangeQuery>({ preset: "30d" });
  const { status, data, retry } = useOverview(range);

  return (
    <section data-testid="executive-overview" className="dark bg-[#0b0c12] text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-6 sm:px-8">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{t("eyebrow")}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{t("title")}</h1>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span className={`size-1.5 rounded-full ${status === "loading" ? "animate-pulse bg-amber-300" : status === "error" ? "bg-rose-400" : "bg-emerald-400"}`} aria-hidden />
              {data ? t("updated", { time: new Date(data.generatedAt).toLocaleString(locale, { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) }) : t("loading")}
            </p>
          </div>
          <RangePicker value={range} onChange={setRange} busy={status === "loading"} />
        </div>
        {status === "error" && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {t("failed")}
            <button type="button" onClick={retry} className="min-h-10 rounded-lg bg-white/10 px-3 text-xs font-semibold active:scale-[0.96] md:hover:bg-white/15">{t("retry")}</button>
          </div>
        )}
        {data ? <div className={`transition-opacity duration-200 ${status === "loading" ? "opacity-60" : ""}`}><Body data={data} /></div> : status !== "error" && <OverviewSkeleton />}
      </div>
    </section>
  );
}
