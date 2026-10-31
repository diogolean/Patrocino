"use client";

import { LockKeyhole, Play } from "lucide-react";
import { useLocale } from "next-intl";
import { formatMoney } from "@mimelux/core/currency";
import { formatDuration, type SubscriberVideo } from "@/lib/gallery";

export type { SubscriberVideo };

export async function loadSubscriberCatalog(username: string): Promise<SubscriberVideo[]> {
  const response = await fetch(`/api/creators/${encodeURIComponent(username)}/subscriber-videos`, { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json().catch(() => ({}))) as { items?: SubscriberVideo[] };
  return data.items ?? [];
}

function shield(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export function SubscriberPpvCard({ video, onOpen }: { video: SubscriberVideo; onOpen: () => void }) {
  const locale = useLocale();
  const duration = formatDuration(video.durationMs);
  const locked = !video.purchased;
  const price = formatMoney(video.priceCents, video.currency ?? "BRL", locale);
  return (
    <button
      type="button"
      data-testid="gallery-ppv"
      data-locked={locked ? "true" : "false"}
      onClick={onOpen}
      onContextMenu={shield}
      onDragStart={shield}
      className="media-shield relative aspect-[3/4] overflow-hidden rounded-[16px] bg-ink text-left text-white"
    >
      <span
        aria-hidden
        className={`absolute inset-0 scale-105 bg-cover bg-center ${locked ? "blur-sm" : ""}`}
        style={video.previewUrl ? { backgroundImage: `url("${video.previewUrl.replace(/"/g, "")}")` } : undefined}
      />
      <span className={`absolute inset-0 ${locked ? "bg-black/25" : "bg-black/15"}`} />
      <span className="relative grid h-full place-items-center p-2 text-center">
        <span>
          <span className="mx-auto flex items-center justify-center gap-1">
            {locked && (
              <span className="grid size-8 place-items-center rounded-full bg-black/50">
                <LockKeyhole className="size-3.5" />
              </span>
            )}
            <span className="grid size-8 place-items-center rounded-full bg-black/50">
              <Play className="size-3.5 fill-white" />
            </span>
          </span>
          {duration ? <span className="mt-2 block text-[10px] font-semibold">{duration}</span> : null}
          {locked ? <span className="mt-1 block text-[10px] font-semibold">{price}</span> : null}
        </span>
      </span>
    </button>
  );
}
