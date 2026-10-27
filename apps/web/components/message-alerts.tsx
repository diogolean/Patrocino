"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { toast } from "sonner";
import { playMessageSound, unlockMessageSound } from "@/lib/message-sound";
import {
  MESSAGE_TOAST_DURATION,
  activeCreatorKey,
  dismissStickyPreview,
  dismissedPreviewIds,
  freshMessages,
  getDockCreator,
  getStickyPreviews,
  previewConversationKey,
  publishIncoming,
  requestOpenThread,
  subscribeStickyPreviews,
  syncStickyWithUnread,
  upsertStickyPreviews,
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

function toastId(item: IncomingMessage) {
  return `message-preview:${previewConversationKey(item)}`;
}

export function MessageAlerts() {
  const pathname = usePathname();
  const t = useTranslations("notifications");
  const dock = useTranslations("dock");
  const errors = useTranslations("errors");
  const pathnameRef = useRef(pathname);
  const seen = useRef(new Set<string>());
  const primed = useRef(false);
  const previewFallback = t("previewFallback");
  const closeLabel = dock("close");
  const creatorFallback = errors("CREATOR_FALLBACK");

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

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
      const openKey = activeCreatorKey(pathnameRef.current, getDockCreator());
      syncStickyWithUnread(data.items);
      const { visible, opened } = freshMessages(data.items, seen.current, openKey);
      if (!primed.current) {
        const pending = visible.filter((item) => !dismissedPreviewIds().has(item.id));
        if (pending.length > 0) upsertStickyPreviews(pending);
        for (const item of data.items) seen.current.add(item.id);
        primed.current = true;
        setUnreadCount(data.count);
        return;
      }
      if (visible.length > 0) {
        void playMessageSound();
        publishIncoming(visible);
        upsertStickyPreviews(visible);
        for (const item of visible) seen.current.add(item.id);
      }
      if (opened.length > 0 && openKey) {
        dismissStickyPreview(openKey);
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

  useEffect(() => {
    const shown = new Set<string>();
    const sync = () => {
      const live = new Set<string>();
      for (const item of getStickyPreviews()) {
        const id = toastId(item);
        live.add(id);
        const key = previewConversationKey(item);
        toast.custom(
          () => (
            <div className="flex w-[min(100vw-2rem,340px)] items-start gap-3 rounded-2xl border border-border bg-elevated p-4 text-left shadow-xl">
              <button
                type="button"
                data-testid="message-toast"
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                onClick={() => {
                  dismissStickyPreview(key);
                  requestOpenThread(item);
                }}
              >
                {item.creatorAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.creatorAvatar} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-base font-black text-ink">
                    {(item.creatorName || creatorFallback).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-base font-extrabold text-foreground">{item.creatorName || creatorFallback}</span>
                  <span className="mt-1 block text-[15px] leading-5 text-muted">{item.preview || previewFallback}</span>
                </span>
              </button>
              <button type="button" aria-label={closeLabel} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface" onClick={() => dismissStickyPreview(key)}>
                <X className="size-4" />
              </button>
            </div>
          ),
          { id, duration: MESSAGE_TOAST_DURATION },
        );
      }
      for (const id of shown) {
        if (!live.has(id)) toast.dismiss(id);
      }
      shown.clear();
      for (const id of live) shown.add(id);
    };
    sync();
    return subscribeStickyPreviews(sync);
  }, [closeLabel, creatorFallback, previewFallback]);

  return null;
}
