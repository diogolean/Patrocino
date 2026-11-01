"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@mimelux/core/currency";
import { Button } from "@mimelux/ui";
import { apiErrorText } from "@/lib/api-error";

type CreatorOption = { id: string; name: string; username: string };
type MoneyRow = { currency: string; salesCents: number; purchases: number; commissionOwedCents: number };
type AffiliateRow = {
  id: string;
  name: string;
  email: string;
  emailPlaceholder: boolean;
  commissionPercent: number;
  status: string;
  summary: { clicks: number; signups: number; purchases: number; money: MoneyRow[] };
  assignments: { creatorId: string; name: string; username: string; commissionPercent: number | null }[];
  links: { code: string; path: string; creatorId: string; username: string }[];
};
type LinkMoney = { currency: string; salesCents: number; commissionCents: number };
type AdminLink = {
  code: string;
  path: string;
  name: string;
  label: string | null;
  pack: { id: string; name: string } | null;
  clicks: number;
  signups: number;
  conversions: number;
  money: LinkMoney[];
};
type PackRow = {
  id: string;
  creatorId: string;
  creatorName: string;
  name: string;
  description: string;
  priceCentsBrl: number;
  priceCentsUsd: number;
  active: boolean;
  postIds: string[];
};

type ErrorTranslator = { has: (key: string) => boolean; (key: string): string };

async function loadJson<T>(path: string, errors: ErrorTranslator, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as T & { message?: unknown; code?: unknown };
  if (!response.ok) throw new Error(apiErrorText(data, errors, fallback));
  return data;
}

export function AdminCommerce() {
  const t = useTranslations("commerce");
  const errors = useTranslations("errors");
  const locale = useLocale();
  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [commission, setCommission] = useState("20");
  const [creatorId, setCreatorId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [packName, setPackName] = useState("");
  const [packBrl, setPackBrl] = useState("149");
  const [packUsd, setPackUsd] = useState("49");
  const [monthlyBrl, setMonthlyBrl] = useState("39");
  const [monthlyUsd, setMonthlyUsd] = useState("8");
  const [videoBrl, setVideoBrl] = useState("49");
  const [videoUsd, setVideoUsd] = useState("19");
  const [guestBrl, setGuestBrl] = useState("59");
  const [guestUsd, setGuestUsd] = useState("24");
  const [defaultBrl, setDefaultBrl] = useState("149");
  const [defaultUsd, setDefaultUsd] = useState("49");
  const [ledger, setLedger] = useState<{ id: string; amountCents: number; currency: string; status: string; linkCode: string }[]>([]);

  const [detailLinks, setDetailLinks] = useState<AdminLink[]>([]);
  const [detailVersion, setDetailVersion] = useState(0);
  const [linkCreatorId, setLinkCreatorId] = useState("");
  const [linkPackId, setLinkPackId] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

  const selected = affiliates.find((item) => item.id === selectedId) ?? null;
  const linkPacks = packs.filter((pack) => pack.active && pack.creatorId === linkCreatorId);

  useEffect(() => {
    if (!selectedId) return;
    let cancel = false;
    fetch(`/api/admin/affiliates/${selectedId}`, { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload: { ledger?: { id: string; amountCents: number; currency: string; status: string; linkCode: string }[]; links?: AdminLink[] } | null) => {
        if (cancel) return;
        setLedger(payload?.ledger ?? []);
        setDetailLinks(payload?.links ?? []);
      })
      .catch(() => {
        if (cancel) return;
        setLedger([]);
        setDetailLinks([]);
      });
    return () => {
      cancel = true;
    };
  }, [selectedId, detailVersion]);

  async function refresh() {
    const data = await loadJson<{ affiliates: AffiliateRow[]; creators: CreatorOption[] }>("/api/admin/affiliates", errors, t("loadFailed"));
    setAffiliates(data.affiliates);
    setCreators(data.creators);
    if (!creatorId && data.creators[0]) setCreatorId(data.creators[0].id);
    const packData = await loadJson<{ packs: PackRow[] }>("/api/admin/packs", errors, t("loadFailed"));
    setPacks(packData.packs);
    const prices = await loadJson<{ packDefaults: { priceCentsBrl: number; priceCentsUsd: number } }>("/api/admin/catalog-prices", errors, t("loadFailed"));
    setDefaultBrl(String(prices.packDefaults.priceCentsBrl / 100));
    setDefaultUsd(String(prices.packDefaults.priceCentsUsd / 100));
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("loadFailed")));
    // The catalog is loaded once when the admin page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAffiliate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setPassword("");
    try {
      const created = await loadJson<{ temporaryPassword: string | null }>("/api/admin/affiliates", errors, t("saveFailed"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          commissionPercent: Number(commission),
          creatorIds: creatorId ? [creatorId] : [],
        }),
      });
      setPassword(created.temporaryPassword ?? "");
      setNotice(t("created"));
      setName("");
      setEmail("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    }
  }

  async function saveAffiliate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await loadJson(`/api/admin/affiliates/${selected.id}`, errors, t("saveFailed"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          commissionPercent: Number(form.get("commission")),
          displayName: String(form.get("displayName") ?? ""),
        }),
      });
      setNotice(t("saved"));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    }
  }

  async function assign(nextCreatorId: string) {
    if (!selected) return;
    await loadJson(`/api/admin/affiliates/${selected.id}/assignments`, errors, t("saveFailed"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId: nextCreatorId }),
    });
    await refresh();
  }

  async function makeLink(nextCreatorId: string) {
    if (!selected) return;
    const link = await loadJson<{ path: string }>(`/api/admin/affiliates/${selected.id}/links`, errors, t("saveFailed"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId: nextCreatorId }),
    });
    setNotice(`${t("linkReady")} ${link.path}`);
    await refresh();
    setDetailVersion((value) => value + 1);
  }

  async function createLink() {
    if (!selected || !linkCreatorId || linkBusy) return;
    setError("");
    setLinkBusy(true);
    try {
      const link = await loadJson<{ path: string }>(`/api/admin/affiliates/${selected.id}/links`, errors, t("saveFailed"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creatorId: linkCreatorId, ...(linkPackId ? { packId: linkPackId } : {}), ...(linkLabel.trim() ? { label: linkLabel.trim() } : {}) }),
      });
      setNotice(`${t("linkReady")} ${link.path}`);
      setLinkLabel("");
      await refresh();
      setDetailVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    } finally {
      setLinkBusy(false);
    }
  }

  async function deactivateLink(code: string) {
    if (!selected || !window.confirm(t("confirmDeactivate"))) return;
    setError("");
    try {
      await loadJson(`/api/admin/affiliates/${selected.id}/links/${encodeURIComponent(code)}`, errors, t("saveFailed"), { method: "DELETE" });
      setNotice(t("linkDeactivated"));
      await refresh();
      setDetailVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    }
  }

  async function createPack(event: FormEvent) {
    event.preventDefault();
    if (!creatorId) return;
    setError("");
    try {
      await loadJson("/api/admin/packs", errors, t("saveFailed"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorId,
          name: packName,
          priceCentsBrl: Math.round(Number(packBrl) * 100),
          priceCentsUsd: Math.round(Number(packUsd) * 100),
          postIds: [],
        }),
      });
      setPackName("");
      setNotice(t("saved"));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    }
  }

  async function savePrices(event: FormEvent) {
    event.preventDefault();
    if (!creatorId) return;
    setError("");
    try {
      await loadJson("/api/admin/catalog-prices", errors, t("saveFailed"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorId,
          monthlyBrlCents: Math.round(Number(monthlyBrl) * 100),
          monthlyUsdCents: Math.round(Number(monthlyUsd) * 100),
          videoBrlCents: Math.round(Number(videoBrl) * 100),
          videoUsdCents: Math.round(Number(videoUsd) * 100),
          guestVideoBrlCents: Math.round(Number(guestBrl) * 100),
          guestVideoUsdCents: Math.round(Number(guestUsd) * 100),
          applyToVideos: true,
        }),
      });
      setNotice(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    }
  }

  async function saveDefaults(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await loadJson("/api/admin/pack-defaults", errors, t("saveFailed"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          priceCentsBrl: Math.round(Number(defaultBrl) * 100),
          priceCentsUsd: Math.round(Number(defaultUsd) * 100),
        }),
      });
      setNotice(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8" data-testid="admin-commerce">
      <h2 className="text-2xl font-extrabold tracking-[-.04em]">{t("title")}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("body")}</p>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-accent/25 px-4 py-3 text-xs">{error}</p>}
      {notice && <p className="mt-4 text-sm font-semibold text-primary-strong">{notice}</p>}
      {password && (
        <p data-testid="admin-affiliate-password" className="mt-3 rounded-2xl border border-border px-4 py-3 text-sm">
          {t("tempPassword")} <span className="font-bold">{password}</span>
        </p>
      )}

      <form onSubmit={createAffiliate} className="mt-6 grid gap-3 rounded-3xl border border-border bg-elevated/70 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-lg font-extrabold">{t("newAffiliate")}</h3>
        <input aria-label={t("name")} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("name")} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("email")} value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("email")} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("commission")} value={commission} onChange={(event) => setCommission(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <select aria-label={t("creator")} value={creatorId} onChange={(event) => setCreatorId(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm">
          {creators.map((creator) => (
            <option key={creator.id} value={creator.id}>{creator.name}</option>
          ))}
        </select>
        <Button type="submit" className="sm:col-span-2 w-fit">{t("createAffiliate")}</Button>
      </form>

      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {affiliates.map((item) => (
            <button key={item.id} type="button" data-testid="admin-affiliate" data-email={item.email} onClick={() => setSelectedId(item.id)} className="w-full rounded-2xl border border-border px-3 py-3 text-left">
              <p className="text-sm font-bold">{item.name}</p>
              <p className="truncate text-xs text-muted">{item.email}</p>
              {item.emailPlaceholder && <p className="mt-1 text-[11px] font-semibold text-primary-strong">{t("placeholderEmail")}</p>}
            </button>
          ))}
        </div>
        {selected && (
          <form onSubmit={saveAffiliate} className="rounded-3xl border border-border bg-elevated/70 p-4">
            <h3 className="text-lg font-extrabold">{selected.name}</h3>
            {selected.emailPlaceholder && <p className="mt-2 text-xs font-semibold text-primary-strong">{t("placeholderEmail")}</p>}
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("email")}
              <input name="email" key={selected.email} defaultValue={selected.email} aria-label={t("editEmail")} className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium normal-case tracking-normal" />
            </label>
            <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("name")}
              <input name="displayName" key={`${selected.id}-name`} defaultValue={selected.name} className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium normal-case tracking-normal" />
            </label>
            <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("commission")}
              <input name="commission" key={`${selected.id}-rate`} defaultValue={String(selected.commissionPercent)} className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium normal-case tracking-normal" />
            </label>
            <Button type="submit" className="mt-4">{t("save")}</Button>
            <p className="mt-4 text-xs text-muted">
              {t("clicks")} {selected.summary.clicks} · {t("signups")} {selected.summary.signups} · {t("purchases")} {selected.summary.purchases}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {selected.summary.money.map((row) => (
                <li key={row.currency}>
                  {t("owed")} {formatMoney(row.commissionOwedCents, row.currency === "USD" ? "USD" : "BRL", locale)}
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2">
              {selected.assignments.map((item) => (
                <div key={item.creatorId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-3 py-2 text-sm">
                  <span>{item.name}</span>
                  <button type="button" className="font-bold text-primary-strong" onClick={() => void makeLink(item.creatorId)}>{t("generateLink")}</button>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-border bg-background/60 p-3" data-testid="admin-link-builder">
              <p className="text-sm font-extrabold">{t("newLink")}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <select aria-label={t("linkCreator")} value={linkCreatorId} onChange={(event) => { setLinkCreatorId(event.target.value); setLinkPackId(""); }} className="h-11 rounded-full border border-border bg-background px-4 text-sm">
                  <option value="">{t("chooseCreator")}</option>
                  {creators.map((creator) => (
                    <option key={creator.id} value={creator.id}>{creator.name}</option>
                  ))}
                </select>
                <select aria-label={t("linkPack")} value={linkPackId} disabled={!linkCreatorId || linkPacks.length === 0} onChange={(event) => setLinkPackId(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm disabled:opacity-60">
                  <option value="">{t("linkNoPack")}</option>
                  {linkPacks.map((pack) => (
                    <option key={pack.id} value={pack.id}>{pack.name}</option>
                  ))}
                </select>
                <input aria-label={t("linkLabel")} placeholder={t("linkLabel")} value={linkLabel} maxLength={60} onChange={(event) => setLinkLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createLink(); } }} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
              </div>
              <Button type="button" className="mt-3" disabled={!linkCreatorId || linkBusy} onClick={() => void createLink()}>{t("createLink")}</Button>
            </div>
            <div className="mt-5" data-testid="admin-affiliate-links">
              <p className="text-sm font-extrabold">{t("linksTitle")}</p>
              {detailLinks.length === 0 && <p className="mt-2 text-xs text-muted">{t("noLinks")}</p>}
              <ul className="mt-2 space-y-2">
                {detailLinks.map((link) => (
                  <li key={link.code} data-testid="admin-affiliate-link" data-code={link.code} className="rounded-2xl border border-border px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-all font-bold">patrocino.com{link.path}</p>
                        <p className="mt-1 text-xs text-muted">
                          {link.name}
                          {link.pack ? ` · ${t("packTag")} ${link.pack.name}` : ""}
                          {link.label ? ` · ${link.label}` : ""}
                        </p>
                      </div>
                      <button type="button" className="shrink-0 text-xs font-bold text-primary-strong" onClick={() => void deactivateLink(link.code)}>{t("deactivate")}</button>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {t("clicks")} {link.clicks} · {t("signups")} {link.signups} · {t("purchases")} {link.conversions}
                      {link.money.map((row) => ` · ${t("sales")} ${formatMoney(row.salesCents, row.currency === "USD" ? "USD" : "BRL", locale)} (${t("commissionShort")} ${formatMoney(row.commissionCents, row.currency === "USD" ? "USD" : "BRL", locale)})`).join("")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {ledger.map((row) => (
                <li key={row.id} data-testid="admin-commission" data-status={row.status} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{row.linkCode} · {formatMoney(row.amountCents, row.currency === "USD" ? "USD" : "BRL", locale)} · {row.status}</span>
                  {row.status === "pending" || row.status === "confirmed" ? (
                    <button
                      type="button"
                      className="font-bold text-primary-strong"
                      onClick={() => void loadJson(`/api/admin/commissions/${row.id}/paid`, errors, t("saveFailed"), { method: "POST" }).then(() => setLedger((current) => current.map((item) => item.id === row.id ? { ...item, status: "paid" } : item)))}
                    >
                      {t("markPaid")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted">
              {t("assign")}
              <select aria-label={t("assign")} defaultValue="" onChange={(event) => { if (event.target.value) void assign(event.target.value); }} className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium normal-case">
                <option value="">{t("chooseCreator")}</option>
                {creators.map((creator) => (
                  <option key={creator.id} value={creator.id}>{creator.name}</option>
                ))}
              </select>
            </label>
          </form>
        )}
      </div>

      <form onSubmit={savePrices} className="mt-8 grid gap-3 rounded-3xl border border-border bg-elevated/70 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-lg font-extrabold">{t("pricesTitle")}</h3>
        <p className="sm:col-span-2 text-sm text-muted">{t("pricesBody")}</p>
        <input aria-label={t("monthlyBrl")} value={monthlyBrl} onChange={(event) => setMonthlyBrl(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("monthlyUsd")} value={monthlyUsd} onChange={(event) => setMonthlyUsd(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("videoBrl")} value={videoBrl} onChange={(event) => setVideoBrl(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("videoUsd")} value={videoUsd} onChange={(event) => setVideoUsd(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("guestVideoBrl")} value={guestBrl} onChange={(event) => setGuestBrl(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("guestVideoUsd")} value={guestUsd} onChange={(event) => setGuestUsd(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <Button type="submit" className="w-fit">{t("savePrices")}</Button>
      </form>

      <form onSubmit={saveDefaults} className="mt-4 grid gap-3 rounded-3xl border border-border bg-elevated/70 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-lg font-extrabold">{t("packDefault")}</h3>
        <input aria-label={t("packBrl")} value={defaultBrl} onChange={(event) => setDefaultBrl(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("packUsd")} value={defaultUsd} onChange={(event) => setDefaultUsd(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <Button type="submit" className="w-fit">{t("save")}</Button>
      </form>

      <form onSubmit={createPack} className="mt-4 grid gap-3 rounded-3xl border border-border bg-elevated/70 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-lg font-extrabold">{t("packsTitle")}</h3>
        <p className="sm:col-span-2 text-sm text-muted">{t("packsBody")}</p>
        <input aria-label={t("packName")} value={packName} onChange={(event) => setPackName(event.target.value)} placeholder={t("packName")} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("packBrl")} value={packBrl} onChange={(event) => setPackBrl(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <input aria-label={t("packUsd")} value={packUsd} onChange={(event) => setPackUsd(event.target.value)} className="h-11 rounded-full border border-border bg-background px-4 text-sm" />
        <Button type="submit" className="w-fit">{t("createPack")}</Button>
        <ul className="sm:col-span-2 space-y-2 text-sm">
          {packs.filter((pack) => pack.active).map((pack) => (
            <li key={pack.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2">
              <span>{pack.name} · {pack.creatorName}</span>
              <button type="button" className="text-xs font-bold" onClick={() => void loadJson(`/api/admin/packs/${pack.id}`, errors, t("saveFailed"), { method: "DELETE" }).then(() => refresh())}>{t("remove")}</button>
            </li>
          ))}
        </ul>
      </form>
    </section>
  );
}
