"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { brl } from "@/lib/gateway";

type SubscriberVideo = {
  id: string;
  mediaId: string;
  caption: string;
  priceCents: number;
  previewUrl: string | null;
  purchased: boolean;
  subscribed: boolean;
};

export function SubscriberVideos({ username, subscribeHref }: { username: string; subscribeHref: string }) {
  const [items, setItems] = useState<SubscriberVideo[] | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/creators/${encodeURIComponent(username)}/subscriber-videos`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { items?: SubscriberVideo[]; subscribed?: boolean };
      })
      .then((data) => {
        if (cancel || !data?.items?.length) return;
        setItems(data.items);
        setSubscribed(data.subscribed === true);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [username]);

  if (!items?.length) return null;

  return (
    <section data-testid="subscriber-ppv" className="mt-6">
      <h2 className="text-sm font-semibold">Vídeos para assinantes</h2>
      <p className="mt-1 text-xs text-muted">A assinatura libera as fotos. Cada vídeo continua bloqueado até o desbloqueio avulso.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const playback = item.purchased ? `/api/media/file/${item.mediaId}` : null;
          return (
            <article key={item.id} className="relative aspect-[3/4] overflow-hidden rounded-[16px] bg-ink">
              {playback ? (
                <video src={playback} controls playsInline className="h-full w-full bg-black object-cover" />
              ) : item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.previewUrl} alt="" className="h-full w-full scale-105 object-cover blur-sm" />
              ) : (
                <div className="h-full w-full bg-ink" />
              )}
              {!playback && (
                <div className="absolute inset-0 grid place-items-center bg-ink/35 p-2 text-center text-white">
                  <div>
                    <span className="mx-auto grid size-8 place-items-center rounded-full bg-black/45">
                      <LockKeyhole className="size-3.5" />
                    </span>
                    {subscribed || item.subscribed ? (
                      <Link
                        data-testid="subscriber-ppv-unlock"
                        href={`/checkout?kind=post&id=${item.id}&creator=${username}&return=/creator/${username}`}
                        className="mt-2 inline-block rounded-full bg-black/55 px-2 py-1 text-[11px] font-semibold"
                      >
                        Desbloquear por {brl(item.priceCents)}
                      </Link>
                    ) : (
                      <Link href={subscribeHref} className="mt-2 inline-block text-[11px] font-semibold">
                        Assine para desbloquear
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
