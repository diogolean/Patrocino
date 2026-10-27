"use client";

import { FormEvent, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { apiErrorText } from "@/lib/api-error";

type Profile = {
  name: string;
  username: string;
  bio: string;
  city: string;
};

type Plan = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  durationMonths: number;
  discountPercent: number;
  active: boolean;
  chargeCents: number;
};

type Studio = {
  creatorId: string;
  profile: Profile;
  plans: Plan[];
};

function reais(cents: number) {
  return (cents / 100).toFixed(2);
}

function centsFromReais(value: string) {
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

async function readJson<T>(response: Response): Promise<T & { code?: unknown; message?: unknown }> {
  return (await response.json().catch(() => ({}))) as T & { code?: unknown; message?: unknown };
}

export function CreatorStudio({ creatorId }: { creatorId?: string }) {
  const t = useTranslations("studio");
  const errors = useTranslations("errors");
  const [studio, setStudio] = useState<Studio | null>(null);
  const [profile, setProfile] = useState<Profile>({ name: "", username: "", bio: "", city: "" });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { name: string; price: string; discount: string; months: string }>>({});
  const [nextPlan, setNextPlan] = useState({ name: t("defaultPlanName"), price: "", discount: "0", months: "1" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        const path = creatorId ? `/api/creators/${encodeURIComponent(creatorId)}/plans` : "/api/creators/me";
        const response = await fetch(path, { cache: "no-store" });
        const data = await readJson<Studio>(response);
        if (cancelled) return;
        if (!response.ok || !data.creatorId) {
          setStudio(null);
          setError(apiErrorText(data, errors, t("openFailed")));
          setLoading(false);
          return;
        }
        setStudio(data);
        setProfile(data.profile);
        setPlans(data.plans);
        setDrafts(
          Object.fromEntries(
            data.plans.map((plan) => [
              plan.id,
              {
                name: plan.name,
                price: reais(plan.priceCents),
                discount: String(plan.discountPercent),
                months: String(plan.durationMonths),
              },
            ]),
          ),
        );
        setLoading(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [creatorId, errors, t]);

  function draftOf(plan: Plan) {
    return drafts[plan.id] ?? { name: plan.name, price: reais(plan.priceCents), discount: String(plan.discountPercent), months: String(plan.durationMonths) };
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!studio) return;
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/creators/${encodeURIComponent(studio.creatorId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profile),
    });
    const data = await readJson<{ profile: Profile }>(response);
    setSaving(false);
    if (!response.ok || !data.profile) {
      setError(apiErrorText(data, errors, t("profileSaveFailed")));
      return;
    }
    setProfile(data.profile);
    setNotice(t("profileUpdated"));
  }

  async function savePlan(plan: Plan) {
    if (!studio) return;
    const draft = draftOf(plan);
    const priceCents = centsFromReais(draft.price);
    const durationMonths = Number(draft.months);
    const discountPercent = Number(draft.discount);
    if (!draft.name.trim() || priceCents === null || !Number.isInteger(durationMonths) || durationMonths < 1) {
      setError(t("invalidPlan"));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/creators/${encodeURIComponent(studio.creatorId)}/plans/${encodeURIComponent(plan.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        priceCents,
        durationMonths,
        discountPercent: Number.isInteger(discountPercent) ? discountPercent : plan.discountPercent,
      }),
    });
    const data = await readJson<{ plan: Plan }>(response);
    setSaving(false);
    if (!response.ok || !data.plan) {
      setError(apiErrorText(data, errors, t("planSaveFailed")));
      return;
    }
    setPlans((current) => current.map((item) => (item.id === plan.id ? data.plan : item)));
    setDrafts((current) => ({
      ...current,
      [plan.id]: {
        name: data.plan.name,
        price: reais(data.plan.priceCents),
        discount: String(data.plan.discountPercent),
        months: String(data.plan.durationMonths),
      },
    }));
    setNotice(t("planUpdated"));
  }

  async function setActive(plan: Plan, active: boolean) {
    if (!studio) return;
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/creators/${encodeURIComponent(studio.creatorId)}/plans/${encodeURIComponent(plan.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const data = await readJson<{ plan: Plan }>(response);
    setSaving(false);
    if (!response.ok || !data.plan) {
      setError(apiErrorText(data, errors, t("planToggleFailed")));
      return;
    }
    setPlans((current) => current.map((item) => (item.id === plan.id ? data.plan : item)));
    setNotice(active ? t("planReactivated") : t("planDeactivated"));
  }

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    if (!studio) return;
    const priceCents = centsFromReais(nextPlan.price);
    const durationMonths = Number(nextPlan.months);
    const discountPercent = Number(nextPlan.discount);
    if (!nextPlan.name.trim() || priceCents === null || !Number.isInteger(durationMonths) || durationMonths < 1) {
      setError(t("invalidPlan"));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/creators/${encodeURIComponent(studio.creatorId)}/plans`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: nextPlan.name.trim(),
        priceCents,
        durationMonths,
        discountPercent: Number.isInteger(discountPercent) ? discountPercent : 0,
        active: true,
      }),
    });
    const data = await readJson<{ plan: Plan }>(response);
    setSaving(false);
    if (!response.ok || !data.plan) {
      setError(apiErrorText(data, errors, t("planCreateFailed")));
      return;
    }
    setPlans((current) => [...current, data.plan].sort((a, b) => a.durationMonths - b.durationMonths));
    setDrafts((current) => ({
      ...current,
      [data.plan.id]: {
        name: data.plan.name,
        price: reais(data.plan.priceCents),
        discount: String(data.plan.discountPercent),
        months: String(data.plan.durationMonths),
      },
    }));
    setNextPlan({ name: "", price: "", discount: "0", months: "1" });
    setNotice(t("planCreated"));
  }

  if (loading) return <p className="text-sm text-muted">{t("loading")}</p>;
  if (!studio) return <p className="text-sm text-muted">{error || t("unavailable")}</p>;

  return (
    <div data-testid="creator-studio" className="space-y-6">
      <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-extrabold">{t("profile")}</h3>
        <Field label={t("name")} value={profile.name} onChange={(name) => setProfile({ ...profile, name })} />
        <Field label={t("username")} value={profile.username} onChange={(username) => setProfile({ ...profile, username })} />
        <Field label={t("city")} value={profile.city} onChange={(city) => setProfile({ ...profile, city })} />
        <Field label={t("bio")} value={profile.bio} onChange={(bio) => setProfile({ ...profile, bio })} />
        <div className="sm:col-span-2">
          <Button data-testid="profile-save" type="submit" disabled={saving}>{t("saveProfile")}</Button>
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-extrabold">{t("plans")}</h3>
        {plans.length === 0 && <p className="text-sm text-muted">{t("noPlans")}</p>}
        {plans.map((plan) => {
          const draft = draftOf(plan);
          return (
            <article key={plan.id} data-testid="creator-plan" data-months={plan.durationMonths} className={`rounded-3xl border border-border p-4 ${plan.active ? "bg-background" : "bg-surface/60 opacity-70"}`}>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label={t("planName")} value={draft.name} onChange={(name) => setDrafts({ ...drafts, [plan.id]: { ...draft, name } })} />
                <Field label={t("price")} value={draft.price} onChange={(price) => setDrafts({ ...drafts, [plan.id]: { ...draft, price } })} testId={`plan-price-${plan.durationMonths}`} />
                <Field label={t("months")} value={draft.months} onChange={(months) => setDrafts({ ...drafts, [plan.id]: { ...draft, months } })} />
                <Field label={t("discount")} value={draft.discount} onChange={(discount) => setDrafts({ ...drafts, [plan.id]: { ...draft, discount } })} />
              </div>
              <p className="mt-2 text-xs text-muted">{t("chargeLine", { state: plan.active ? t("active") : t("inactive"), amount: reais(plan.chargeCents) })}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button data-testid={`plan-save-${plan.durationMonths}`} type="button" disabled={saving} onClick={() => void savePlan(plan)}>{t("savePlan")}</Button>
                <Button data-testid={`plan-active-${plan.durationMonths}`} type="button" variant="outline" disabled={saving} onClick={() => void setActive(plan, !plan.active)}>
                  {plan.active ? t("deactivate") : t("reactivate")}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <form onSubmit={createPlan} className="rounded-3xl border border-dashed border-border p-4">
        <h3 className="text-sm font-extrabold">{t("newPlan")}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Field label={t("planName")} value={nextPlan.name} onChange={(name) => setNextPlan({ ...nextPlan, name })} />
          <Field label={t("price")} value={nextPlan.price} onChange={(price) => setNextPlan({ ...nextPlan, price })} testId="plan-create-price" />
          <Field label={t("months")} value={nextPlan.months} onChange={(months) => setNextPlan({ ...nextPlan, months })} />
          <Field label={t("discount")} value={nextPlan.discount} onChange={(discount) => setNextPlan({ ...nextPlan, discount })} />
        </div>
        <Button data-testid="plan-create" className="mt-3" type="submit" disabled={saving}>{t("createPlan")}</Button>
      </form>

      {error && <p role="alert" className="rounded-2xl bg-accent/25 px-4 py-3 text-xs font-medium">{error}</p>}
      {notice && <p data-testid="studio-notice" className="text-sm font-semibold text-primary-strong">{notice}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId?: string;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-muted">
      {label}
      <input
        aria-label={label}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium normal-case tracking-normal text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}
