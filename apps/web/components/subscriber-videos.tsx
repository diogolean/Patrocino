"use client";

import { LockKeyhole, Play } from "lucide-react";
import { brl } from "@/lib/gateway";
import { formatDuration, type SubscriberVideo } from "@/lib/gallery";
import { watermarkStyle } from "@/lib/watermark";

export type { SubscriberVideo };

export type SubscriberCatalog = {
  items: SubscriberVideo[];
  viewerHandle: string | null;
};

export async function loadSubscriberCatalog(username: string): Promise<SubscriberCatalog> {
  const response = await fetch(`/api/creators/${encodeURIComponent(username)}/subscriber-videos`, { cache: "no-store" });
  if (!response.ok) return { items: [], viewerHandle: null };
  const data = (await response.json().catch(() => ({}))) as {
    items?: SubscriberVideo[];
    viewerHandle?: string | null;
  };
  return { items: data.items ?? [], viewerHandle: data.viewerHandle ?? null };
}

function shield(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export function SubscriberPpvCard({
  video,
  handle,
  onOpen,
}: {
  video: SubscriberVideo;
  handle: string | null;
  onOpen: () => void;
}) {
  const duration = formatDuration(video.durationMs);
  const mark = handle ? watermarkStyle(handle) : undefined;
  return (
    <button
      type="button"
      data-testid="gallery-ppv"
      data-locked={video.purchased ? "false" : "true"}
      onClick={onOpen}
      onContextMenu={shield}
      onDragStart={shield}
      className="media-shield relative aspect-[3/4] overflow-hidden rounded-[16px] bg-ink text-left text-white"
    >
      <span
        aria-hidden
        className="absolute inset-0 scale-105 bg-cover bg-center blur-md"
        style={video.previewUrl ? { backgroundImage: `url("${video.previewUrl.replace(/"/g, "")}")` } : undefined}
      />
      <span className="absolute inset-0 bg-ink/40" />
      {mark ? <span aria-hidden className="pointer-events-none absolute inset-0" style={mark} /> : null}
      <span className="relative grid h-full place-items-center p-2 text-center">
        <span>
          <span className="mx-auto flex items-center justify-center gap-1">
            {!video.purchased && (
              <span className="grid size-8 place-items-center rounded-full bg-black/50">
                <LockKeyhole className="size-3.5" />
              </span>
            )}
            <span className="grid size-8 place-items-center rounded-full bg-black/50">
              <Play className="size-3.5 fill-white" />
            </span>
          </span>
          {duration ? <span className="mt-2 block text-[10px] font-semibold">{duration}</span> : null}
          {!video.purchased ? <span className="mt-1 block text-[10px] font-semibold">{brl(video.priceCents)}</span> : null}
        </span>
      </span>
    </button>
  );
}
