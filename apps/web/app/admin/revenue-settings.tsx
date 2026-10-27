"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { apiErrorText } from "@/lib/api-error";

type CreatorRow = {
  id: string;
  name: string;
  username: string;
  creatorSharePercent: number | null;
  affiliateCommissionPercent: number | null;
};

export function RevenueSettings() {
  const t = useTranslations("admin");
  const errors = useTranslations("errors");
  const [creatorShare, setCreatorShare] = useState("80");
  const [affiliateShare, setAffiliateShare] = useState("20");
  const [query, setQuery] = useState("");
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [selected, setSelected] = useState<CreatorRow | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadCreators = useCallback(async (nextQuery: string) => {
    const response = await fetch(`/api/admin/creators?q=${encodeURIComponent(nextQuery)}`, { cache: "no-store" });
    const data = (await response.json()) as { code?: unknown; message?: unknown; creators?: CreatorRow[] };
    if (!response.ok) {
      setError(apiErrorText(data, errors, t("creatorsFailed")));
      return;
    }
    setCreators(data.creators ?? []);
  }, [errors, t]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetch("/api/admin/settings", { cache: "no-store" })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as { code?: unknown; message?: unknown; creatorSharePercent?: number; affiliateCommissionPercent?: number };
          if (!response.ok) {
            setError(apiErrorText(data, errors, t("loadFailed")));
            return;
          }
          if (typeof data.creatorSharePercent === "number") setCreatorShare(String(data.creatorSharePercent));
          if (typeof data.affiliateCommissionPercent === "number") setAffiliateShare(String(data.affiliateCommissionPercent));
        })
        .catch(() => setError(t("loadFailed")));
      void loadCreators("");
    }, 0);
    return () => window.clearTimeout(handle);
  }, [errors, loadCreators, t]);

  async function saveDefaults(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setError("");
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creatorSharePercent: Number(creatorShare),
        affiliateCommissionPercent: Number(affiliateShare),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
    if (!response.ok) {
      setError(apiErrorText(data, errors, t("saveFailedSplit")));
      return;
    }
    setNotice(t("savedSplit"));
  }

  async function saveCreator(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setNotice("");
    setError("");
    const response = await fetch(`/api/admin/creators/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creatorSharePercent: selected.creatorSharePercent,
        affiliateCommissionPercent: selected.affiliateCommissionPercent,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { code?: unknown; message?: unknown; creator?: CreatorRow };
    if (!response.ok || !data.creator) {
      setError(apiErrorText(data, errors, t("creatorSaveFailed")));
      return;
    }
    setSelected(data.creator);
    setCreators((current) => current.map((creator) => (creator.id === data.creator?.id ? data.creator : creator)));
    setNotice(t("creatorUpdated"));
  }

  return (
    <section className="mx-auto mt-6 w-full max-w-6xl space-y-4 px-4 sm:px-8">
      <form onSubmit={saveDefaults} className="rounded-3xl border border-border bg-elevated/70 p-4 sm:p-5">
        <h2 className="text-lg font-extrabold">{t("splitTitle")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          {t("splitBody")}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("creatorShare")}
            <input data-testid="admin-creator-share" value={creatorShare} onChange={(event) => setCreatorShare(event.target.value)} inputMode="numeric" className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("affiliateShare")}
            <input data-testid="admin-affiliate-share" value={affiliateShare} onChange={(event) => setAffiliateShare(event.target.value)} inputMode="numeric" className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal" />
          </label>
        </div>
        <Button data-testid="admin-split-save" type="submit" className="mt-4">{t("saveSplit")}</Button>
      </form>
      <form onSubmit={saveCreator} className="rounded-3xl border border-border bg-elevated/70 p-4 sm:p-5">
        <h2 className="text-lg font-extrabold">{t("creators")}</h2>
        <input data-testid="admin-creator-search" value={query} onChange={(event) => { setQuery(event.target.value); void loadCreators(event.target.value); }} placeholder={t("searchCreator")} aria-label={t("searchLabel")} className="mt-3 h-11 w-full rounded-full border border-border bg-background px-4 text-sm" />
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {creators.slice(0, 8).map((creator) => (
            <button key={creator.id} type="button" data-testid="admin-creator" data-username={creator.username} onClick={() => setSelected(creator)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${selected?.id === creator.id ? "border-primary bg-primary/15" : "border-border"}`}>
              {creator.name}
            </button>
          ))}
        </div>
        {selected && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("ownShare")}
              <input data-testid="admin-creator-override" value={selected.creatorSharePercent ?? ""} placeholder={t("defaultPlaceholder")} onChange={(event) => setSelected({ ...selected, creatorSharePercent: event.target.value === "" ? null : Number(event.target.value) })} className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm normal-case" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("ownCommission")}
              <input data-testid="admin-affiliate-override" value={selected.affiliateCommissionPercent ?? ""} placeholder={t("defaultPlaceholder")} onChange={(event) => setSelected({ ...selected, affiliateCommissionPercent: event.target.value === "" ? null : Number(event.target.value) })} className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm normal-case" />
            </label>
          </div>
        )}
        {selected && <Button data-testid="admin-creator-save" type="submit" className="mt-4">{t("saveCreator")}</Button>}
        {notice && <p className="mt-3 text-sm font-semibold text-primary-strong">{notice}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}
