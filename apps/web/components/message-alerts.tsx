"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { playMessageSound, unlockMessageSound } from "@/lib/message-sound";
import {
  freshMessages,
  openCreatorKey,
  THREAD_REFRESH_EVENT,
  UNREAD_POLL_MS,
  UNREAD_REFRESH_EVENT,
  type IncomingMessage,
} from "@/lib/message-notifications";
import { resumeStoredPush } from "@/lib/push-browser";
import { setUnreadCount } from "@/lib/unread-store";

async function fetchUnread() {
  const response = await fetch("/api/notifications/unread", { cache: "no-store" });
  if (response.status === 401) return { count: 0, items: [] as IncomingMessage[] };
  if (!response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { count?: number; items?: IncomingMessage[] };
  return { count: data.count ?? 0, items: data.items ?? [] };
}

async function markRead(creatorKey: string) {
  const response = await fetch(`/api/conversations/with/${encodeURIComponent(creatorKey)}/read`, { method: "POST" });
  if (!response.ok) throw new Error("read failed");
}

export function MessageAlerts() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("notifications");
  const pathnameRef = useRef(pathname);
  const seen = useRef(new Set<string>());
  const primed = useRef(false);
  const routerRef = useRef(router);
  const previewFallback = t("previewFallback");

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const unlock = () => unlockMessageSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    void resumeStoredPush();
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden) return;
      const data = await fetchUnread().catch(() => null);
      if (stop || !data) return;
      const openKey = openCreatorKey(pathnameRef.current);
      const { visible, opened } = freshMessages(data.items, seen.current, openKey);
      if (!primed.current) {
        for (const item of data.items) seen.current.add(item.id);
        primed.current = true;
        setUnreadCount(data.count);
        return;
      }
      if (visible.length > 0) {
        void playMessageSound();
        for (const item of visible) {
          seen.current.add(item.id);
          toast.custom(
            (id) => (
              <button
                type="button"
                data-testid="message-toast"
                onClick={() => {
                  toast.dismiss(id);
                  routerRef.current.push(item.url);
                }}
                className="flex w-[min(100vw-2rem,22rem)] items-center gap-3 rounded-2xl border border-border bg-elevated p-3 text-left shadow-xl"
              >
                {item.creatorAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.creatorAvatar} alt="" className="size-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-black text-ink">
                    {item.creatorName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-extrabold text-foreground">{item.creatorName}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted">{item.preview || previewFallback}</span>
                </span>
              </button>
            ),
            { duration: 7000 },
          );
        }
      }
      if (opened.length > 0 && openKey) {
        try {
          await markRead(openKey);
          for (const item of opened) seen.current.add(item.id);
          window.dispatchEvent(new CustomEvent(THREAD_REFRESH_EVENT, { detail: openKey }));
        } catch {
          // The next poll tries again while this conversation stays open.
        }
        const again = await fetchUnread().catch(() => null);
        if (!stop && again) setUnreadCount(again.count);
        return;
      }
      setUnreadCount(data.count);
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, UNREAD_POLL_MS);
    const onWake = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener(UNREAD_REFRESH_EVENT, onWake);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener(UNREAD_REFRESH_EVENT, onWake);
    };
  }, [previewFallback]);

  return null;
}
