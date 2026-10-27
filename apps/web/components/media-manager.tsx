"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { apiErrorText } from "@/lib/api-error";

export type MediaVisibility = "free" | "subscribers" | "ppv" | "subscriber_ppv";

export type MediaLibraryItem = {
  id: string;
  creatorId: string;
  caption: string;
  visibility: MediaVisibility;
  priceCents: number | null;
  publishedAt: string | null;
  sortOrder: number;
  locked: boolean;
  kind: "IMAGE" | "VIDEO";
  mimeType: string;
  byteSize: number | null;
  posterUrl: string | null;
  previewUrl: string | null;
  fileUrl: string | null;
};

type Draft = {
  caption: string;
  visibility: MediaVisibility;
  price: string;
  publishedAt: string;
};

type Job = {
  key: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  message: string;
};

const visibilityKey: Record<MediaVisibility, "free" | "subscribers" | "ppv" | "subscriberPpv"> = {
  free: "free",
  subscribers: "subscribers",
  ppv: "ppv",
  subscriber_ppv: "subscriberPpv",
};

const visibilityOrder: MediaVisibility[] = ["subscribers", "free", "ppv", "subscriber_ppv"];

function pricedVisibility(visibility: MediaVisibility) {
  return visibility === "ppv" || visibility === "subscriber_ppv";
}

function browserFileUrl(fileUrl: string | null) {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/media\/([^/]+)\/file$/);
  return match?.[1] ? `/api/media/file/${match[1]}` : null;
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function reais(cents: number | null) {
  if (!cents) return "";
  return (cents / 100).toFixed(2);
}

function centsFromInput(value: string) {
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function formatBytes(size: number | null) {
  if (!size) return "";
  if (size >= 1_000_000_000) return `${(size / 1_000_000_000).toFixed(1)} GB`;
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1000))} KB`;
}

async function explainResponse(
  response: Response,
  errors: { has: (key: string) => boolean; (key: string): string },
  fallback: string,
) {
  const data = (await response.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
  return apiErrorText(data, errors, fallback);
}

async function uploadFile(
  file: File,
  creatorId: string | undefined,
  fields: { caption: string; visibility: MediaVisibility; priceCents: number | null; publishedAt: string | null },
  onProgress: (value: number) => void,
  errors: { has: (key: string) => boolean; (key: string): string },
  copy: { start: string; chunk: string; publish: string },
) {
  const storageKey = `patrocino-upload:${creatorId ?? "self"}:${file.name}:${file.size}:${file.lastModified}`;
  let uploadId = window.sessionStorage.getItem(storageKey);
  let chunkSize = 5 * 1024 * 1024;
  let totalChunks = Math.ceil(file.size / chunkSize);
  let received = new Set<number>();

  if (uploadId) {
    const status = await fetch(`/api/media/uploads/${encodeURIComponent(uploadId)}`, { cache: "no-store" });
    if (status.ok) {
      const data = (await status.json()) as {
        status?: string;
        chunkSize?: number;
        totalChunks?: number;
        received?: number[];
      };
      if (data.status === "open" && data.chunkSize && data.totalChunks) {
        chunkSize = data.chunkSize;
        totalChunks = data.totalChunks;
        received = new Set(data.received ?? []);
      } else {
        uploadId = null;
        window.sessionStorage.removeItem(storageKey);
      }
    } else {
      uploadId = null;
      window.sessionStorage.removeItem(storageKey);
    }
  }

  if (!uploadId) {
    const started = await fetch("/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creatorId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        chunkSize,
      }),
    });
    if (!started.ok) throw new Error(await explainResponse(started, errors, copy.start));
    const data = (await started.json()) as { id: string; chunkSize: number; totalChunks: number };
    uploadId = data.id;
    chunkSize = data.chunkSize;
    totalChunks = data.totalChunks;
    window.sessionStorage.setItem(storageKey, uploadId);
  }

  for (let index = 0; index < totalChunks; index += 1) {
    if (received.has(index)) {
      onProgress((index + 1) / totalChunks);
      continue;
    }
    const start = index * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    let sent = false;
    let lastError = copy.chunk;
    for (let attempt = 0; attempt < 3 && !sent; attempt += 1) {
      const response = await fetch(`/api/media/uploads/${encodeURIComponent(uploadId)}/chunks/${index}`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: file.slice(start, end),
      });
      if (response.ok) {
        sent = true;
        break;
      }
      lastError = await explainResponse(response, errors, copy.chunk);
      if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 413) {
        throw new Error(lastError);
      }
    }
    if (!sent) throw new Error(lastError);
    onProgress((index + 1) / totalChunks);
  }

  const completed = await fetch(`/api/media/uploads/${encodeURIComponent(uploadId)}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      caption: fields.caption.trim() || undefined,
      visibility: fields.visibility,
      priceCents: pricedVisibility(fields.visibility) ? fields.priceCents : null,
      publishedAt: fields.publishedAt,
    }),
  });
  if (!completed.ok) throw new Error(await explainResponse(completed, errors, copy.publish));
  window.sessionStorage.removeItem(storageKey);
  const data = (await completed.json()) as { item?: MediaLibraryItem };
  return data.item ?? null;
}

function draftFor(item: MediaLibraryItem): Draft {
  return {
    caption: item.caption,
    visibility: item.visibility,
    price: reais(item.priceCents),
    publishedAt: toLocalInput(item.publishedAt),
  };
}

export function MediaManager({ creatorId }: { creatorId?: string }) {
  const t = useTranslations("media");
  const errors = useTranslations("errors");
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<MediaVisibility>("subscribers");
  const [price, setPrice] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("1.00");
  const [defaultPriceCents, setDefaultPriceCents] = useState(100);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const path = creatorId ? `/api/media/items?creatorId=${encodeURIComponent(creatorId)}` : "/api/media/items";
    const response = await fetch(path, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as {
      items?: MediaLibraryItem[];
      defaultVideoPriceCents?: number;
      code?: unknown;
      message?: unknown;
    };
    if (!response.ok || !data.items) {
      setError(apiErrorText(data, errors, t("loadFailed")));
      setItems([]);
      setLoading(false);
      return;
    }
    if (typeof data.defaultVideoPriceCents === "number" && data.defaultVideoPriceCents > 0) {
      setDefaultPriceCents(data.defaultVideoPriceCents);
      setDefaultPrice(reais(data.defaultVideoPriceCents) || "1.00");
    }
    setItems(data.items);
    setDrafts(Object.fromEntries(data.items.map((item) => [item.id, draftFor(item)])));
    setLoadedAt(Date.now());
    setLoading(false);
  }, [creatorId, errors, t]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  async function take(list: FileList | File[]) {
    const files = [...list];
    if (files.length === 0) return;
    const priceCents = centsFromInput(price);
    if (visibility === "ppv" && !priceCents) {
      setError(t("priceRequired"));
      return;
    }
    setError("");
    for (const file of files) {
      const key = `${file.name}:${file.size}:${file.lastModified}:${crypto.randomUUID()}`;
      setJobs((current) => [...current, { key, name: file.name, progress: 0, status: "uploading", message: "" }]);
      try {
        const item = await uploadFile(
          file,
          creatorId,
          { caption, visibility, priceCents, publishedAt: fromLocalInput(publishedAt) },
          (progress) => {
            setJobs((current) => current.map((job) => (job.key === key ? { ...job, progress } : job)));
          },
          errors,
          { start: t("startFailed"), chunk: t("chunkFailed"), publish: t("publishFailed") },
        );
        setJobs((current) =>
          current.map((job) => (job.key === key ? { ...job, status: "done", progress: 1, message: t("published") } : job)),
        );
        if (item) {
          setItems((current) => [...current, item]);
          setDrafts((current) => ({ ...current, [item.id]: draftFor(item) }));
        }
      } catch (caught) {
        const message = caught instanceof Error && caught.message ? caught.message : t("uploadFailed");
        setJobs((current) => current.map((job) => (job.key === key ? { ...job, status: "error", message } : job)));
      }
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void take(event.dataTransfer.files);
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void take(event.target.files);
    event.target.value = "";
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const draft = current[id];
      if (!draft) return current;
      return { ...current, [id]: { ...draft, ...patch } };
    });
  }

  async function save(item: MediaLibraryItem, event: FormEvent) {
    event.preventDefault();
    const draft = drafts[item.id];
    if (!draft) return;
    const nextPrice = pricedVisibility(draft.visibility) ? centsFromInput(draft.price) : null;
    if (draft.visibility === "ppv" && !nextPrice) {
      setError(t("priceRequired"));
      return;
    }
    setError("");
    const response = await fetch(`/api/media/items/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: draft.caption,
        visibility: draft.visibility,
        priceCents: nextPrice,
        publishedAt: fromLocalInput(draft.publishedAt),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { item?: MediaLibraryItem; code?: unknown; message?: unknown };
    if (!response.ok || !data.item) {
      setError(apiErrorText(data, errors, t("saveFailed")));
      return;
    }
    const saved = data.item;
    setItems((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
    setDrafts((current) => ({ ...current, [saved.id]: draftFor(saved) }));
  }

  async function saveDefaultPrice() {
    const cents = centsFromInput(defaultPrice);
    if (!cents) {
      setError(t("defaultPriceRequired"));
      return;
    }
    setError("");
    const response = await fetch("/api/media/video-price", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId, defaultVideoPriceCents: cents }),
    });
    const data = (await response.json().catch(() => ({}))) as { defaultVideoPriceCents?: number; code?: unknown; message?: unknown };
    if (!response.ok || typeof data.defaultVideoPriceCents !== "number") {
      setError(apiErrorText(data, errors, t("defaultSaveFailed")));
      return;
    }
    setDefaultPriceCents(data.defaultVideoPriceCents);
    setDefaultPrice(reais(data.defaultVideoPriceCents) || "1.00");
  }

  async function remove(item: MediaLibraryItem) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setError("");
    const response = await fetch(`/api/media/items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await explainResponse(response, errors, t("deleteFailed")));
      return;
    }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  }

  async function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= items.length) return;
    const reordered = [...items];
    const current = reordered[index];
    const target = reordered[next];
    if (!current || !target) return;
    reordered[index] = target;
    reordered[next] = current;
    setItems(reordered);
    const response = await fetch("/api/media/items/order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorId, ids: reordered.map((item) => item.id) }),
    });
    if (!response.ok) {
      setError(await explainResponse(response, errors, t("reorderFailed")));
      void load();
    }
  }

  return (
    <section data-testid="media-library" className="rounded-[28px] border border-border bg-elevated/70 p-4 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-[-.03em]">{t("libraryTitle")}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">{t("libraryBody")}</p>
        </div>
      </div>

      <form
        className="mt-4 flex flex-col gap-3 rounded-[24px] border border-border bg-background p-4 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void saveDefaultPrice();
        }}
      >
        <label className="block flex-1 text-xs font-bold uppercase tracking-wide text-muted">
          {t("defaultPrice")}
          <input
            data-testid="default-video-price"
            inputMode="decimal"
            value={defaultPrice}
            onChange={(event) => setDefaultPrice(event.target.value)}
            className="mt-2 h-11 w-full rounded-full border border-border bg-elevated px-4 text-sm font-medium normal-case tracking-normal outline-none focus:border-primary"
          />
        </label>
        <Button type="submit" size="sm" data-testid="default-video-price-save">
          {t("saveDefault")}
        </Button>
        <p className="text-xs font-medium normal-case tracking-normal text-muted sm:max-w-xs sm:pb-2">{t("defaultHint")}</p>
      </form>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-bold uppercase tracking-wide text-muted">
          {t("batchCaption")}
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder={t("optional")}
            className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium normal-case tracking-normal outline-none focus:border-primary"
          />
        </label>
        <label className="block text-xs font-bold uppercase tracking-wide text-muted">
          {t("access")}
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as MediaVisibility)}
            className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal outline-none focus:border-primary"
          >
            {visibilityOrder.map((value) => (
              <option key={value} value={value}>{t(visibilityKey[value])}</option>
            ))}
          </select>
        </label>
        {pricedVisibility(visibility) && (
          <label className="block text-xs font-bold uppercase tracking-wide text-muted">
            {t("price")}
            <input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder={visibility === "subscriber_ppv" ? reais(defaultPriceCents) || t("placeholderSubscriber") : t("placeholderPpv")}
              className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium normal-case tracking-normal outline-none focus:border-primary"
            />
            {visibility === "subscriber_ppv" && (
              <span className="mt-2 block font-medium normal-case tracking-normal">
                {t("blankDefault", { price: (reais(defaultPriceCents) || "1.00").replace(".", ",") })}
              </span>
            )}
          </label>
        )}
        <label className="block text-xs font-bold uppercase tracking-wide text-muted">
          {t("publishAt")}
          <input
            type="datetime-local"
            value={publishedAt}
            onChange={(event) => setPublishedAt(event.target.value)}
            className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium normal-case tracking-normal outline-none focus:border-primary"
          />
        </label>
      </div>

      <label
        data-testid="media-dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed px-4 py-8 text-center ${
          dragging ? "border-primary bg-primary/10" : "border-border bg-background"
        }`}
      >
        <input
          data-testid="media-file-input"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
          multiple
          className="sr-only"
          onChange={onPick}
        />
        <span className="text-sm font-extrabold">{t("dropTitle")}</span>
        <span className="mt-1 text-xs text-muted">{t("dropBody")}</span>
      </label>

      {jobs.length > 0 && (
        <ul className="mt-4 space-y-2">
          {jobs.map((job) => (
            <li key={job.key} className="rounded-2xl border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-bold">{job.name}</span>
                <span className="text-muted">{job.status === "error" ? job.message : `${Math.round(job.progress * 100)}%`}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className={`h-full ${job.status === "error" ? "bg-accent" : "bg-primary"}`}
                  style={{ width: `${Math.round(job.progress * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-accent/25 px-4 py-3 text-xs font-medium">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {loading && <p className="text-sm text-muted">{t("loading")}</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted">{t("empty")}</p>
        )}
        {items.map((item, index) => {
          const draft = drafts[item.id] ?? draftFor(item);
          const playback = browserFileUrl(item.fileUrl);
          const scheduled = Boolean(item.publishedAt && loadedAt && new Date(item.publishedAt).getTime() > loadedAt);
          return (
            <article key={item.id} className="rounded-[24px] border border-border bg-background p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="w-full shrink-0 sm:w-36">
                  {item.posterUrl || item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.posterUrl || item.previewUrl || ""}
                      alt=""
                      className="aspect-[4/5] w-full rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="grid aspect-[4/5] place-items-center rounded-2xl bg-surface text-[10px] text-muted">{t("noCover")}</div>
                  )}
                </div>
                <form onSubmit={(event) => void save(item, event)} className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary-strong">
                    <span>{item.kind === "VIDEO" ? t("video") : t("photo")}</span>
                    <span>{t(visibilityKey[item.visibility])}</span>
                    {item.locked && <span>{t("locked")}</span>}
                    {scheduled && <span>{t("scheduled")}</span>}
                    {item.byteSize ? <span className="text-muted">{formatBytes(item.byteSize)}</span> : null}
                  </div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                    {t("caption")}
                    <input
                      value={draft.caption}
                      onChange={(event) => updateDraft(item.id, { caption: event.target.value })}
                      className="mt-2 h-11 w-full rounded-full border border-border bg-elevated px-4 text-sm font-medium normal-case tracking-normal outline-none focus:border-primary"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                      {t("access")}
                      <select
                        value={draft.visibility}
                        onChange={(event) => updateDraft(item.id, { visibility: event.target.value as MediaVisibility })}
                        className="mt-2 h-11 w-full rounded-full border border-border bg-elevated px-4 text-sm font-semibold normal-case tracking-normal outline-none focus:border-primary"
                      >
                        {visibilityOrder.map((value) => (
                          <option key={value} value={value}>{t(visibilityKey[value])}</option>
                        ))}
                      </select>
                    </label>
                    {pricedVisibility(draft.visibility) && (
                      <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                        {t("price")}
                        <input
                          data-testid="media-item-price"
                          inputMode="decimal"
                          value={draft.price}
                          placeholder={draft.visibility === "subscriber_ppv" ? reais(defaultPriceCents) || t("placeholderSubscriber") : t("placeholderPpv")}
                          onChange={(event) => updateDraft(item.id, { price: event.target.value })}
                          className="mt-2 h-11 w-full rounded-full border border-border bg-elevated px-4 text-sm font-medium normal-case tracking-normal outline-none focus:border-primary"
                        />
                        {draft.visibility === "subscriber_ppv" && (
                          <span className="mt-2 block font-medium normal-case tracking-normal">
                            {t("blankDefaultShort")}
                          </span>
                        )}
                      </label>
                    )}
                    <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                      {t("publishAt")}
                      <input
                        type="datetime-local"
                        value={draft.publishedAt}
                        onChange={(event) => updateDraft(item.id, { publishedAt: event.target.value })}
                        className="mt-2 h-11 w-full rounded-full border border-border bg-elevated px-4 text-sm font-medium normal-case tracking-normal outline-none focus:border-primary"
                      />
                    </label>
                  </div>
                  {item.locked && item.previewUrl && (
                    <p className="text-[11px] text-muted">
                      {t("lockedPreview")}
                    </p>
                  )}
                  {playback && item.kind === "VIDEO" && (
                    <video src={playback} poster={item.posterUrl ?? undefined} controls className="max-h-48 w-full rounded-2xl bg-black" />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm">{t("save")}</Button>
                    <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => void move(index, -1)}>
                      {t("moveUp")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={index === items.length - 1} onClick={() => void move(index, 1)}>
                      {t("moveDown")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void remove(item)}>
                      {t("remove")}
                    </Button>
                  </div>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
