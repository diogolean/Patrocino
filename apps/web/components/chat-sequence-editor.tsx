"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { apiErrorText } from "@/lib/api-error";

type Step = {
  position: number;
  delayMinutes: number;
  bodyTemplate: string;
  offerMode: "none" | "latest" | "post";
  postId: string | null;
  recurring: boolean;
};

type Video = { id: string; title: string; priceCents: number };

type Sequence = {
  creatorId: string;
  enabled: boolean;
  steps: Step[];
  videos?: Video[];
};

async function readJson<T>(response: Response): Promise<T & { code?: unknown; message?: unknown }> {
  return (await response.json().catch(() => ({}))) as T & { code?: unknown; message?: unknown };
}

export function ChatSequenceEditor({ creatorId }: { creatorId?: string }) {
  const t = useTranslations("studio");
  const errors = useTranslations("errors");
  const [resolvedId, setResolvedId] = useState(creatorId ?? "");
  const [enabled, setEnabled] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
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
        setNotice("");
        let id = creatorId ?? "";
        if (!id) {
          const me = await fetch("/api/creators/me", { cache: "no-store" });
          const studio = await readJson<{ creatorId?: string }>(me);
          if (!me.ok || !studio.creatorId) {
            if (!cancelled) {
              setError(apiErrorText(studio, errors, t("seqOpenFailed")));
              setLoading(false);
            }
            return;
          }
          id = studio.creatorId;
        }
        const response = await fetch(`/api/creators/${encodeURIComponent(id)}/chat-sequence`, { cache: "no-store" });
        const data = await readJson<Sequence>(response);
        if (cancelled) return;
        if (!response.ok || !data.creatorId) {
          setError(apiErrorText(data, errors, t("seqOpenFailed")));
          setLoading(false);
          return;
        }
        setResolvedId(data.creatorId);
        setEnabled(data.enabled);
        setSteps(data.steps.map((step) => ({ ...step, recurring: step.recurring === true })));
        setVideos(data.videos ?? []);
        setLoading(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [creatorId, errors, t]);

  function updateStep(position: number, patch: Partial<Step>) {
    setSteps((current) => current.map((step) => (step.position === position ? { ...step, ...patch } : step)));
  }

  async function save() {
    if (!resolvedId) return;
    setSaving(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/creators/${encodeURIComponent(resolvedId)}/chat-sequence`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled,
        steps: steps.map((step) => ({
          position: step.position,
          delayMinutes: step.delayMinutes,
          bodyTemplate: step.bodyTemplate,
          offerMode: step.offerMode,
          postId: step.offerMode === "post" ? step.postId : null,
          recurring: step.recurring,
        })),
      }),
    });
    const data = await readJson<Sequence>(response);
    setSaving(false);
    if (!response.ok || !Array.isArray(data.steps)) {
      setError(apiErrorText(data, errors, t("seqSaveFailed")));
      return;
    }
    setEnabled(data.enabled);
    setSteps(data.steps.map((step) => ({ ...step, recurring: step.recurring === true })));
    setNotice(t("seqSaved"));
  }

  if (loading) return <div className="mt-4 h-40 rounded-[22px] skeleton" />;
  if (!resolvedId && error) return <p className="mt-4 text-sm text-muted">{error}</p>;

  return (
    <div data-testid="chat-sequence" className="mt-4 space-y-4">
      <label className="flex items-center gap-3 text-sm font-bold">
        <input data-testid="sequence-enabled" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        {t("seqEnable")}
      </label>
      {steps.length === 0 ? (
        <p className="rounded-[22px] bg-surface/60 px-4 py-6 text-sm text-muted dark:bg-white/5">{t("seqEmpty")}</p>
      ) : (
        steps.map((step, index) => (
          <article key={step.position} data-testid="sequence-step" className="rounded-[22px] bg-surface/60 p-4 dark:bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold">{step.recurring ? t("seqRecurring", { index: index + 1 }) : index === 0 ? t("seqWelcome") : t("seqStep", { index: index + 1 })}</p>
              <button type="button" className="text-[10px] font-bold text-muted" onClick={() => setSteps((current) => current.filter((item) => item.position !== step.position))}>
                {t("seqRemove")}
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted">
              <input
                type="checkbox"
                checked={step.recurring}
                onChange={(event) => updateStep(step.position, { recurring: event.target.checked })}
              />
              {t("seqRepeat")}
            </label>
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-muted">
              {step.recurring ? t("seqInterval") : t("seqDelay")}
              <input
                type="number"
                min={0}
                value={step.delayMinutes}
                onChange={(event) => updateStep(step.position, { delayMinutes: Math.max(0, Math.round(Number(event.target.value))) })}
                className="mt-1 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none"
              />
            </label>
            {step.recurring && (
              <p className="mt-1 text-[10px] text-muted">{t("seqRotation")}</p>
            )}
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-muted">
              {t("seqText")}
              <textarea
                value={step.bodyTemplate}
                onChange={(event) => updateStep(step.position, { bodyTemplate: event.target.value })}
                rows={3}
                className="mt-1 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold normal-case tracking-normal text-foreground outline-none"
              />
            </label>
            <p className="mt-1 text-[10px] text-muted">{t("seqVariables")}</p>
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-muted">
              {t("seqVideo")}
              <select
                value={step.offerMode === "post" ? `post:${step.postId ?? ""}` : step.offerMode}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "none" || value === "latest") updateStep(step.position, { offerMode: value, postId: null });
                  else updateStep(step.position, { offerMode: "post", postId: value.slice("post:".length) });
                }}
                className="mt-1 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none"
              >
                <option value="none">{t("seqNone")}</option>
                <option value="latest">{t("seqLatest")}</option>
                {videos.map((video) => (
                  <option key={video.id} value={`post:${video.id}`}>
                    {video.title}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setSteps((current) => [
              ...current,
              {
                position: current.reduce((max, step) => Math.max(max, step.position), -1) + 1,
                delayMinutes: 60,
                bodyTemplate: t("seqTemplate"),
                offerMode: "latest",
                postId: null,
                recurring: false,
              },
            ])
          }
        >
          {t("seqAdd")}
        </Button>
        <Button type="button" data-testid="sequence-save" onClick={() => void save()} disabled={saving}>
          {saving ? t("seqSaving") : t("seqSave")}
        </Button>
      </div>
      {error && <p className="text-sm text-muted">{error}</p>}
      {notice && <p data-testid="sequence-notice" className="text-sm font-semibold">{notice}</p>}
    </div>
  );
}
