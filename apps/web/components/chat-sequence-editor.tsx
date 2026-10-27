"use client";

import { useEffect, useState } from "react";
import { Button } from "@mimelux/ui";

type Step = {
  position: number;
  delayMinutes: number;
  bodyTemplate: string;
  offerMode: "none" | "latest" | "post";
  postId: string | null;
};

type Video = { id: string; title: string; priceCents: number };

type Sequence = {
  creatorId: string;
  enabled: boolean;
  steps: Step[];
  videos?: Video[];
};

async function readJson<T>(response: Response): Promise<T & { message?: string }> {
  return (await response.json().catch(() => ({}))) as T & { message?: string };
}

export function ChatSequenceEditor({ creatorId }: { creatorId?: string }) {
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
              setError(studio.message || "Não foi possível abrir a sequência.");
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
          setError(data.message || "Não foi possível abrir a sequência.");
          setLoading(false);
          return;
        }
        setResolvedId(data.creatorId);
        setEnabled(data.enabled);
        setSteps(data.steps);
        setVideos(data.videos ?? []);
        setLoading(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [creatorId]);

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
        })),
      }),
    });
    const data = await readJson<Sequence>(response);
    setSaving(false);
    if (!response.ok || !Array.isArray(data.steps)) {
      setError(data.message || "Não foi possível salvar a sequência.");
      return;
    }
    setEnabled(data.enabled);
    setSteps(data.steps);
    setNotice("Sequência salva.");
  }

  if (loading) return <div className="mt-4 h-40 rounded-[22px] skeleton" />;
  if (!resolvedId && error) return <p className="mt-4 text-sm text-muted">{error}</p>;

  return (
    <div data-testid="chat-sequence" className="mt-4 space-y-4">
      <label className="flex items-center gap-3 text-sm font-bold">
        <input data-testid="sequence-enabled" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Enviar a sequência para novas assinaturas
      </label>
      {steps.length === 0 ? (
        <p className="rounded-[22px] bg-surface/60 px-4 py-6 text-sm text-muted dark:bg-white/5">Nenhum passo nesta sequência.</p>
      ) : (
        steps.map((step, index) => (
          <article key={step.position} data-testid="sequence-step" className="rounded-[22px] bg-surface/60 p-4 dark:bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold">{index === 0 ? "Boas-vindas" : `Passo ${index + 1}`}</p>
              <button type="button" className="text-[10px] font-bold text-muted" onClick={() => setSteps((current) => current.filter((item) => item.position !== step.position))}>
                Remover
              </button>
            </div>
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-muted">
              Espera (horas)
              <input
                type="number"
                min={0}
                value={step.delayMinutes / 60}
                onChange={(event) => updateStep(step.position, { delayMinutes: Math.max(0, Math.round(Number(event.target.value) * 60)) })}
                className="mt-1 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none"
              />
            </label>
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-muted">
              Texto
              <textarea
                value={step.bodyTemplate}
                onChange={(event) => updateStep(step.position, { bodyTemplate: event.target.value })}
                rows={3}
                className="mt-1 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold normal-case tracking-normal text-foreground outline-none"
              />
            </label>
            <p className="mt-1 text-[10px] text-muted">{"Variáveis: {fanName}, {creatorName}, {videoTitle}, {price}"}</p>
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-muted">
              Vídeo
              <select
                value={step.offerMode === "post" ? `post:${step.postId ?? ""}` : step.offerMode}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "none" || value === "latest") updateStep(step.position, { offerMode: value, postId: null });
                  else updateStep(step.position, { offerMode: "post", postId: value.slice("post:".length) });
                }}
                className="mt-1 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none"
              >
                <option value="none">Nenhum</option>
                <option value="latest">Último vídeo ainda não comprado</option>
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
                bodyTemplate: "{fanName}, olha {videoTitle}. Está por {price}.",
                offerMode: "latest",
                postId: null,
              },
            ])
          }
        >
          Adicionar passo
        </Button>
        <Button type="button" data-testid="sequence-save" onClick={() => void save()} disabled={saving}>
          {saving ? "Salvando..." : "Salvar sequência"}
        </Button>
      </div>
      {error && <p className="text-sm text-muted">{error}</p>}
      {notice && <p data-testid="sequence-notice" className="text-sm font-semibold">{notice}</p>}
    </div>
  );
}
