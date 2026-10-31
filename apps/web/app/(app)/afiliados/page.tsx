"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Copy, Link2, Package, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatMoney } from "@mimelux/core";
import { Button, Pill } from "@mimelux/ui";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";
import { roleHome, useRoleGuard } from "@/lib/use-role-guard";

// Any account can hold an affiliate profile without changing its role (e.g. a fan who also
// promotes creators). Non-affiliate roles are let in only when /affiliate/me finds a profile.
const PROFILE_ROLES = ["admin", "fan", "creator"] as const;

type LedgerStatus = "pending" | "confirmed" | "paid" | "reversed";
type LedgerRow = { id: string; createdAt: string; amountCents: number; currency: string; status: LedgerStatus; kind: string; linkCode: string; saleCents: number };
type SeriesPoint = { label: string; clicks: number; conversions: number; earningsCents: number };
type LinkMoney = { currency: string; salesCents: number; commissionCents: number };
type LinkStat = {
  code: string;
  path: string;
  username: string;
  name: string;
  label?: string | null;
  pack?: { id: string; name: string } | null;
  clicks: number;
  conversions: number;
  conversionRate: number;
  money?: LinkMoney[];
};
type Dashboard = {
  name?: string;
  summary: { clicks: number; signups: number; purchases: number; money: { currency: string; salesCents: number; commissionOwedCents: number }[] };
  ledger: LedgerRow[];
  links: LinkStat[];
  daily: SeriesPoint[];
  monthly: SeriesPoint[];
};
type Catalog = { creators: { id: string; username: string; name: string; packs: { id: string; name: string }[] }[] };

function money(cents: number, currency: string, locale: string) {
  return formatMoney(cents, currency === "USD" ? "USD" : "BRL", locale);
}

async function fetchBoard(): Promise<Dashboard | "missing" | null> {
  const response = await fetch("/api/affiliate/me", { cache: "no-store" }).catch(() => null);
  if (!response) return null;
  if (response.status === 404) return "missing";
  return response.ok ? ((await response.json()) as Dashboard) : null;
}

export default function AffiliateDashboardPage() {
  const roleAllowed = useRoleGuard("affiliate", PROFILE_ROLES);
  const router = useRouter();
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const sessionRole = session.user?.role;
  const t = useTranslations("affiliate");
  const tc = useTranslations("commerce");
  const locale = useLocale();
  const [board, setBoard] = useState<Dashboard | null>(null);
  const [missing, setMissing] = useState(false);

  const apply = useCallback((result: Dashboard | "missing" | null) => {
    if (result === "missing") setMissing(true);
    else if (result) setBoard(result);
  }, []);
  const load = useCallback(async () => apply(await fetchBoard()), [apply]);

  useEffect(() => {
    if (!roleAllowed) return;
    let cancel = false;
    fetchBoard().then((result) => {
      if (!cancel) apply(result);
    });
    return () => {
      cancel = true;
    };
  }, [roleAllowed, apply]);

  useEffect(() => {
    if (missing && sessionRole && sessionRole !== "affiliate") router.replace(roleHome(sessionRole));
  }, [missing, router, sessionRole]);

  if (!roleAllowed || (!board && !missing)) return <div className="m-6 h-[70vh] rounded-[30px] skeleton" />;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-8 lg:py-9">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>{t("eyebrow")}</Pill>
        {board?.name ? <Pill active>{tc("affiliateName", { name: board.name })}</Pill> : null}
      </div>
      <h1 className="mt-3 text-3xl font-extrabold tracking-[-.045em]">{t("title")}</h1>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-muted">{t("body")}</p>
      {board ? (
        <>
          <Summary board={board} locale={locale} />
          <LinkBuilder onCreated={load} />
          <MyLinks links={board.links ?? []} locale={locale} onChanged={load} />
          <Results board={board} locale={locale} />
        </>
      ) : null}
    </div>
  );
}

function Summary({ board, locale }: { board: Dashboard; locale: string }) {
  const t = useTranslations("affiliate");
  const tc = useTranslations("commerce");
  const rows = board.summary.money.length ? board.summary.money : [{ currency: locale === "pt-BR" ? "BRL" : "USD", salesCents: 0, commissionOwedCents: 0 }];
  const cards: [string, string][] = [
    [tc("clicks"), String(board.summary.clicks)],
    [tc("signups"), String(board.summary.signups)],
    [tc("purchases"), String(board.summary.purchases)],
    [t("self_salesTotal"), rows.map((row) => money(row.salesCents ?? 0, row.currency, locale)).join(" · ")],
    [tc("ledgerTitle"), rows.map((row) => money(row.commissionOwedCents, row.currency, locale)).join(" · ")],
  ];
  return (
    <section data-testid="affiliate-summary" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map(([label, value]) => (
        <article key={label} className="min-w-0 rounded-[24px] border border-border bg-elevated/70 p-4 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[.99]">
          <p className="truncate text-[10px] font-bold uppercase tracking-[.14em] text-muted">{label}</p>
          <p className="mt-2 break-words text-lg font-black leading-6">{value}</p>
        </article>
      ))}
    </section>
  );
}

function LinkBuilder({ onCreated }: { onCreated: () => Promise<void> }) {
  const t = useTranslations("affiliate");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [creatorId, setCreatorId] = useState("");
  const [packId, setPackId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch("/api/affiliate/catalog", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as Catalog) : null))
      .then((payload) => {
        if (cancel || !payload) return;
        setCatalog(payload);
        setCreatorId(payload.creators[0]?.id ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const creator = catalog?.creators.find((item) => item.id === creatorId);

  async function create() {
    if (!creatorId || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/affiliate/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creatorId, packId: packId || null, label: label.trim() || null }),
      });
      const data = (await response.json().catch(() => ({}))) as { path?: string };
      if (response.status === 429) return void toast.error(t("self_rateLimited"));
      if (!response.ok || !data.path) return void toast.error(t("self_createFailed"));
      await navigator.clipboard?.writeText(`${window.location.origin}${data.path}`).catch(() => undefined);
      toast.success(t("self_created"));
      setLabel("");
      await onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="affiliate-builder" className="mt-6 rounded-[28px] border border-border bg-elevated/70 p-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold"><Link2 className="size-4" /> {t("self_newLink")}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-[10px] font-bold text-muted">
          {t("self_creator")}
          <select
            data-testid="builder-creator"
            value={creatorId}
            onChange={(event) => {
              setCreatorId(event.target.value);
              setPackId("");
            }}
            className="h-12 rounded-2xl border border-border bg-background px-3 text-sm font-semibold text-foreground"
          >
            {catalog?.creators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-bold text-muted">
          {t("self_pack")}
          <select
            data-testid="builder-pack"
            value={packId}
            onChange={(event) => setPackId(event.target.value)}
            disabled={!creator?.packs.length}
            className="h-12 rounded-2xl border border-border bg-background px-3 text-sm font-semibold text-foreground disabled:opacity-60"
          >
            <option value="">{t("self_noPack")}</option>
            {creator?.packs.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-bold text-muted">
          {t("self_label")}
          <input
            data-testid="builder-label"
            value={label}
            maxLength={40}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="tiktok, instagram…"
            className="h-12 rounded-2xl border border-border bg-background px-3 text-sm text-foreground"
          />
        </label>
      </div>
      <Button data-testid="builder-generate" className="mt-4 w-full sm:w-auto" disabled={!creatorId || busy} onClick={create}>
        {busy ? t("self_generating") : t("self_generate")}
      </Button>
    </section>
  );
}

function MyLinks({ links, locale, onChanged }: { links: LinkStat[]; locale: string; onChanged: () => Promise<void> }) {
  const t = useTranslations("affiliate");
  const tc = useTranslations("commerce");
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("copied"));
  }

  async function remove(code: string) {
    if (!window.confirm(t("self_confirmRemove"))) return;
    const response = await fetch(`/api/affiliate/links/${encodeURIComponent(code)}`, { method: "DELETE" });
    if (response.ok) {
      toast.success(t("self_removed"));
      await onChanged();
    }
  }

  return (
    <section data-testid="affiliate-my-links" className="mt-6 rounded-[28px] border border-border bg-elevated/70 p-5">
      <h2 className="text-sm font-extrabold">{t("self_myLinks")}</h2>
      {links.length === 0 ? <p className="mt-3 text-xs text-muted">{t("self_noOwnLinks")}</p> : null}
      <ul className="mt-3 space-y-3">
        {links.map((link) => {
          const url = `${origin}${link.path}`;
          return (
            <li key={link.code} data-testid="affiliate-link" className="rounded-2xl bg-surface/70 p-3 transition hover:bg-surface dark:bg-white/5">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm">{link.name || link.username}</b>
                {link.pack ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/25 px-2 py-0.5 text-[10px] font-bold">
                    <Package className="size-3" /> {link.pack.name}
                  </span>
                ) : null}
                {link.label ? <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold">{link.label}</span> : null}
              </div>
              <p className="mt-1 break-all text-xs font-semibold text-muted">{url}</p>
              <p className="mt-2 text-xs">
                {tc("clicks")} {link.clicks} · {tc("purchases")} {link.conversions} · {tc("conversionRate")} {Math.round(link.conversionRate * 100)}%
                {(link.money ?? []).map((row) => (
                  <span key={row.currency}>
                    {" "}· {t("self_sale")} {money(row.salesCents, row.currency, locale)} · {t("self_commission")} {money(row.commissionCents, row.currency, locale)}
                  </span>
                ))}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => copy(url)}><Copy className="size-4" /> {t("copy")}</Button>
                <Button size="sm" variant="outline" onClick={() => remove(link.code)}><Trash2 className="size-4" /> {t("self_remove")}</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Results({ board, locale }: { board: Dashboard; locale: string }) {
  const t = useTranslations("commerce");
  const ta = useTranslations("affiliate");
  const [grain, setGrain] = useState<"day" | "month">("day");
  const series = (grain === "day" ? board.daily : board.monthly) ?? [];
  const ledger = board.ledger ?? [];
  const peak = Math.max(1, ...series.map((point) => point.earningsCents));
  const statusLabel = (status: LedgerStatus) =>
    status === "confirmed" ? t("statusConfirmed") : status === "paid" ? t("statusPaid") : status === "reversed" ? t("statusReversed") : t("statusPending");
  return (
    <section data-testid="affiliate-live" className="mt-6 space-y-4">
      <div className="rounded-[28px] border border-border bg-elevated/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold">{t("liveTitle")}</h2>
          <div className="flex gap-2 text-xs font-bold">
            <button type="button" data-testid="chart-daily" onClick={() => setGrain("day")} className={grain === "day" ? "text-primary-strong" : "text-muted"}>{t("daily")}</button>
            <button type="button" data-testid="chart-monthly" onClick={() => setGrain("month")} className={grain === "month" ? "text-primary-strong" : "text-muted"}>{t("monthly")}</button>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">{t("liveBody")}</p>
        <div data-testid="affiliate-chart" className="mt-4 flex h-28 items-end gap-1">
          {series.map((point) => (
            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${point.label}: ${point.clicks} / ${point.conversions}`}>
              <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(4, Math.round((point.earningsCents / peak) * 88))}px` }} />
              <span className="truncate text-[9px] text-muted">{point.label.slice(5)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted">{t("chartHint")}</p>
      </div>
      <div className="scroll-mt-24 rounded-[28px] border border-border bg-elevated/70 p-5">
        <h2 className="text-sm font-extrabold leading-6">{t("ledgerTitle")}</h2>
        {ledger.length === 0 ? <p className="mt-2 text-xs text-muted">{t("liveEmpty")}</p> : null}
        <ul className="mt-3 space-y-2 text-sm">
          {ledger.map((row) => (
            <li key={row.id} data-testid="commission-row" data-status={row.status} className="grid gap-1 rounded-2xl bg-surface/60 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <span className="text-xs text-muted">{new Date(row.createdAt).toLocaleDateString(locale)} · {row.kind} · {row.linkCode}</span>
              <span className="text-xs font-semibold">
                {ta("self_sale")} {money(row.saleCents, row.currency, locale)} · {ta("self_commission")} {money(row.amountCents, row.currency, locale)} · {statusLabel(row.status)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
