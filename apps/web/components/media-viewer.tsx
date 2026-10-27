"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";

export type ViewerSlide = {
  id: string;
  kind: "image" | "video";
  src?: string;
  mediaId?: string;
  poster?: string;
  caption?: string;
};

type Resolved = { id: string; src: string };

function shield(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export function MediaViewer({
  slides,
  index,
  onIndex,
  onClose,
}: {
  slides: ViewerSlide[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const slide = slides[index];
  const [zoomFor, setZoomFor] = useState({ id: "", zoom: 1 });
  const [fetched, setFetched] = useState<Resolved | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const zoom = slide && zoomFor.id === slide.id ? zoomFor.zoom : 1;
  const resolved = slide?.mediaId
    ? fetched?.id === slide.id
      ? fetched
      : null
    : slide?.src
      ? { id: slide.id, src: slide.src }
      : null;
  const failed = Boolean(slide && failedId === slide.id && !resolved);

  useEffect(() => {
    if (!slide?.mediaId) return;
    let cancel = false;
    const id = slide.id;
    const mediaId = slide.mediaId;
    void fetch(`/api/media/access/${encodeURIComponent(mediaId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { url?: string };
        if (!response.ok || !data.url) throw new Error("unavailable");
        return { id, src: data.url };
      })
      .then((next) => {
        if (!cancel) setFetched(next);
      })
      .catch(() => {
        if (!cancel) setFailedId(id);
      });
    return () => {
      cancel = true;
    };
  }, [slide?.id, slide?.mediaId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex(Math.min(slides.length - 1, index + 1));
      if (event.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [index, onClose, onIndex, slides.length]);

  function setZoom(next: number) {
    if (!slide) return;
    setZoomFor({ id: slide.id, zoom: Math.min(3, Math.max(1, next)) });
  }

  function swipe(event: TouchEvent) {
    if (event.touches.length !== 1 || zoom !== 1) return;
    const point = event.touches[0];
    if (!point) return;
    touch.current = { x: point.clientX, y: point.clientY };
  }

  function swipeEnd(event: TouchEvent) {
    const start = touch.current;
    touch.current = null;
    const point = event.changedTouches[0];
    if (!start || !point || zoom !== 1) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) onIndex(Math.min(slides.length - 1, index + 1));
    else onIndex(Math.max(0, index - 1));
  }

  if (!slide) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={slide.caption || "Mídia"}
      className="media-shield fixed inset-0 z-[80] flex flex-col bg-black text-white"
      onContextMenu={shield}
      onTouchStart={swipe}
      onTouchEnd={swipeEnd}
    >
      <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-xs font-semibold tabular-nums text-white/80">
          {index + 1} / {slides.length}
        </p>
        <button type="button" aria-label="Fechar" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/10">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {slides.length > 1 && (
          <>
            <button type="button" aria-label="Anterior" onClick={() => onIndex(Math.max(0, index - 1))} className="absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" aria-label="Próxima" onClick={() => onIndex(Math.min(slides.length - 1, index + 1))} className="absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
        <div
          className="flex h-full items-center justify-center overflow-hidden px-3"
          style={zoom === 1 ? undefined : { transform: `scale(${zoom})` }}
        >
          {failed ? (
            <p className="px-6 text-center text-sm text-white/80">Não foi possível abrir esta mídia.</p>
          ) : !resolved ? (
            <p className="text-sm text-white/70">Abrindo…</p>
          ) : slide.kind === "video" ? (
            <video
              key={resolved.src}
              src={resolved.src}
              poster={slide.poster}
              controls
              controlsList="nodownload"
              disablePictureInPicture
              playsInline
              autoPlay
              draggable={false}
              onContextMenu={shield}
              onDragStart={shield}
              className="media-shield max-h-full max-w-full bg-black"
            />
          ) : (
            <ShieldedPhoto src={resolved.src} onZoom={() => setZoom(zoom === 1 ? 2 : 1)} />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <p className="line-clamp-1 text-xs text-white/75">{slide.caption}</p>
        {slide.kind === "image" && resolved && (
          <div className="flex shrink-0 gap-2">
            <button type="button" aria-label="Diminuir" onClick={() => setZoom(zoom - 1)} className="grid size-11 place-items-center rounded-full bg-white/10">
              <Minus className="size-4" />
            </button>
            <button type="button" aria-label="Aumentar" onClick={() => setZoom(zoom + 1)} className="grid size-11 place-items-center rounded-full bg-white/10">
              <Plus className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ShieldedPhoto({ src, onZoom }: { src: string; onZoom: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let cancel = false;
    void fetch(src, { cache: "no-store", credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        if (cancel) return;
        const parent = node.parentElement;
        const maxWidth = parent?.clientWidth || bitmap.width;
        const maxHeight = parent?.clientHeight || bitmap.height;
        const fit = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);
        const width = Math.max(1, Math.round(bitmap.width * fit));
        const height = Math.max(1, Math.round(bitmap.height * fit));
        const ratio = window.devicePixelRatio || 1;
        node.width = Math.round(width * ratio);
        node.height = Math.round(height * ratio);
        node.style.width = `${width}px`;
        node.style.height = `${height}px`;
        const context = node.getContext("2d");
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [src]);

  return <canvas ref={canvas} className="media-shield max-h-full max-w-full" onDoubleClick={onZoom} onContextMenu={shield} onDragStart={shield} />;
}
