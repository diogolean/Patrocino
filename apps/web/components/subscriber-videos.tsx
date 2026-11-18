"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, Play } from "lucide-react";
import { useLocale } from "next-intl";
import { formatMoney } from "@mimelux/core/currency";
import { refreshSession } from "@/lib/session";
import { formatDuration, ppvCardView, type SubscriberVideo } from "@/lib/gallery";

export type { SubscriberVideo };

export async function loadSubscriberCatalog(username: string): Promise<SubscriberVideo[]> {
  // The 15-minute access cookie may have lapsed; renew it first so a buyer is not served the anonymous, locked catalog.
  await refreshSession().catch(() => null);
  const response = await fetch(`/api/creators/${encodeURIComponent(username)}/subscriber-videos`, { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json().catch(() => ({}))) as { items?: SubscriberVideo[] };
  return data.items ?? [];
}

function shield(event: { preventDefault: () => void }) {
  event.preventDefault();
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export function SubscriberPpvCard({ video, onOpen }: { video: SubscriberVideo; onOpen: () => void }) {
  const locale = useLocale();
  const duration = formatDuration(video.durationMs);
  const reducedMotion = useReducedMotion();
  const { locked, cover } = ppvCardView(video);
  const price = formatMoney(video.priceCents, video.currency ?? "BRL", locale);
  const clip = locked && video.clipUrl && !reducedMotion ? video.clipUrl : null;
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
      {clip ? (
        <video
          src={clip}
          poster={cover ?? undefined}
          muted
          autoPlay
          loop
          playsInline
          className={`absolute inset-0 h-full w-full object-cover ${locked ? "blur-md" : ""}`}
        />
      ) : locked && cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" draggable={false} className="absolute inset-0 h-full w-full scale-[1.02] object-cover blur-md" />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 scale-[1.02] bg-cover bg-center"
          style={cover ? { backgroundImage: `url("${cover.replace(/"/g, "")}")` } : undefined}
        />
      )}
      <span className={`absolute inset-0 ${locked ? "bg-black/30" : "bg-black/15"}`} />
      <span className="relative grid h-full place-items-center p-2 text-center">
        <span>
          <span className="mx-auto flex items-center justify-center gap-1">
            {locked && (
              <span className="grid size-7 place-items-center rounded-full bg-black/55">
                <LockKeyhole className="size-3" />
              </span>
            )}
            <span className="grid size-8 place-items-center rounded-full bg-black/50">
              <Play className="size-3.5 fill-white" />
            </span>
          </span>
          {duration ? <span className="mt-2 block text-[10px] font-semibold">{duration}</span> : null}
          {locked ? (
            <span className="mt-2 inline-flex min-h-7 items-center justify-center rounded-full bg-white px-3 text-[11px] font-bold text-ink">{price}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
