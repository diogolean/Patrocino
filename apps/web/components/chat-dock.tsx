"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Expand, MessageCircle, Minus, Send, X } from "lucide-react";
import { Button } from "@mimelux/ui";
import { messageBodyParts } from "@/lib/chat-creator";
import { brl } from "@/lib/gateway";
import {
  INCOMING_MESSAGE_EVENT,
  OPEN_THREAD_EVENT,
  PUSH_CHOICE_KEY,
  THREAD_REFRESH_EVENT,
  UNREAD_REFRESH_EVENT,
  dismissStickyPreview,
  getServerStickyPreviews,
  getStickyPreviews,
  needsHomeScreenInstall,
  previewConversationKey,
  requestUnreadRefresh,
  setDockCreator,
  subscribeStickyPreviews,
  type IncomingMessage,
} from "@/lib/message-notifications";
import { readPushConfig, registerPush } from "@/lib/push-browser";
import { getServerSessionSnapshot, getSessionSnapshot, subscribeSession } from "@/lib/session";
import { getServerUnreadSnapshot, getUnreadSnapshot, subscribeUnread, unreadBadge } from "@/lib/unread-store";

type InboxItem = {
  id: string;
  creatorId: string;
  creatorUsername: string | null;
  creatorName: string;
  creatorAvatar: string | null;
  preview: string;
  unread: number;
  lastAt: string;
};

type ThreadMessage = {
  id: string;
  body: string;
  mine?: boolean;
  offer: { postId: string; title: string; priceCents: number; purchased: boolean } | null;
};

type OpenThread = {
  key: string;
  name: string;
  avatar: string | null;
};

const lift = "bottom-[calc(72px+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6";

function creatorKey(item: { creatorId: string; creatorUsername?: string | null }) {
  return item.creatorUsername || item.creatorId;
}

function Avatar({ name, src, className }: { name: string; src: string | null; className: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={`${className} rounded-full object-cover`} />
    );
  }
  return (
    <span className={`${className} grid place-items-center rounded-full bg-primary text-sm font-black text-ink`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function DockNotifications() {
  const t = useTranslations("notifications");
  const dock = useTranslations("dock");
  const [phase, setPhase] = useState<"hidden" | "ask" | "ios" | "denied" | "unavailable">("hidden");

  useEffect(() => {
    let cancel = false;
    const ios = needsHomeScreenInstall({
      userAgent: window.navigator.userAgent,
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      iosStandalone: (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
      maxTouchPoints: window.navigator.maxTouchPoints,
    });
    void readPushConfig()
      .then((config) => {
        if (cancel || !config.enabled) return;
        if (ios) {
          setPhase("ios");
          return;
        }
        if (!("Notification" in window) || Notification.permission === "granted") return;
        setPhase(Notification.permission === "denied" ? "denied" : "ask");
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  async function enable() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPhase("unavailable");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPhase("denied");
      return;
    }
    const config = await readPushConfig();
    if (!config.enabled) {
      setPhase("unavailable");
      return;
    }
    try {
      const saved = await registerPush(config.publicKey);
      if (!saved) {
        setPhase("unavailable");
        return;
      }
    } catch {
      setPhase("unavailable");
      return;
    }
    window.localStorage.setItem(PUSH_CHOICE_KEY, "enabled");
    window.dispatchEvent(new Event("patrocino:push-choice"));
    setPhase("hidden");
  }

  if (phase === "hidden") return null;
  const note = phase === "ios" ? t("iosHint") : phase === "denied" ? t("denied") : phase === "unavailable" ? t("unavailable") : dock("notifyHint");
  return (
    <div className="mx-3 mt-3 flex items-center gap-3 rounded-2xl bg-surface/80 px-3 py-2">
      <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted">{note}</p>
      {phase === "ask" && (
        <button type="button" className="shrink-0 cursor-pointer text-[11px] font-extrabold text-primary-strong" onClick={() => void enable()}>
          {t("enable")}
        </button>
      )}
    </div>
  );
}

export function ChatDock() {
  const pathname = usePathname();
  const t = useTranslations("dock");
  const previewFallback = useTranslations("notifications")("previewFallback");
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const unread = useSyncExternalStore(subscribeUnread, getUnreadSnapshot, getServerUnreadSnapshot).count;
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<OpenThread | null>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [threadState, setThreadState] = useState<"loading" | "ready" | "error">("loading");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const previews = useSyncExternalStore(subscribeStickyPreviews, getStickyPreviews, getServerStickyPreviews);
  const scroller = useRef<HTMLDivElement>(null);
  const fan = session.status === "ready" && session.user?.role === "fan";
  const onChat = pathname === "/chat" || pathname.startsWith("/chat/");
  const threadKey = thread?.key ?? null;
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    if (onChat && open) {
      setOpen(false);
      setThread(null);
    }
  }

  useEffect(() => {
    setDockCreator(!onChat && open && threadKey ? threadKey : null);
    return () => setDockCreator(null);
  }, [open, threadKey, onChat]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setThread(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const item = (event as CustomEvent<IncomingMessage>).detail;
      if (!item) return;
      setMessages([]);
      setThreadState("loading");
      setThread({ key: creatorKey(item), name: item.creatorName, avatar: item.creatorAvatar });
      setDockCreator(creatorKey(item));
      setOpen(true);
      setSendError("");
      setDraft("");
      dismissStickyPreview(previewConversationKey(item));
    };
    window.addEventListener(OPEN_THREAD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_THREAD_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open || threadKey) return;
    let cancel = false;
    const load = () => {
      fetch("/api/conversations", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("list failed");
          return (await response.json()) as { items?: InboxItem[] };
        })
        .then((payload) => {
          if (!cancel) {
            setItems(payload.items ?? []);
            setListState("ready");
          }
        })
        .catch(() => {
          if (!cancel) setListState("error");
        });
    };
    load();
    window.addEventListener(UNREAD_REFRESH_EVENT, load);
    window.addEventListener(INCOMING_MESSAGE_EVENT, load);
    return () => {
      cancel = true;
      window.removeEventListener(UNREAD_REFRESH_EVENT, load);
      window.removeEventListener(INCOMING_MESSAGE_EVENT, load);
    };
  }, [open, threadKey, listAttempt]);

  useEffect(() => {
    if (!open || !threadKey) return;
    let cancel = false;
    const load = () => {
      fetch(`/api/conversations/with/${encodeURIComponent(threadKey)}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("thread failed");
          return (await response.json()) as { messages?: ThreadMessage[]; creator?: { name?: string; avatarUrl?: string | null } | null };
        })
        .then((payload) => {
          if (cancel) return;
          setMessages(payload.messages ?? []);
          setThreadState("ready");
          const name = payload.creator?.name;
          const avatar = payload.creator?.avatarUrl;
          if (name) {
            setThread((current) => {
              if (!current || current.key !== threadKey) return current;
              if (current.name === name && current.avatar === (avatar ?? current.avatar)) return current;
              return { ...current, name, avatar: avatar ?? current.avatar };
            });
          }
          requestUnreadRefresh();
        })
        .catch(() => {
          if (!cancel) setThreadState("error");
        });
    };
    load();
    const onThread = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (key === threadKey) load();
    };
    window.addEventListener(THREAD_REFRESH_EVENT, onThread);
    return () => {
      cancel = true;
      window.removeEventListener(THREAD_REFRESH_EVENT, onThread);
    };
  }, [open, threadKey]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, threadState]);

  if (!fan || (onChat && !open)) return null;

  function closeDock() {
    setOpen(false);
    setThread(null);
    setDockCreator(null);
  }

  function openList() {
    setThread(null);
    setDockCreator(null);
    setListState("loading");
    setOpen(true);
  }

  function openChat(next: OpenThread) {
    setMessages([]);
    setThreadState("loading");
    setThread(next);
    setDockCreator(next.key);
    setOpen(true);
    setSendError("");
    setDraft("");
    dismissStickyPreview(next.key);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thread) return;
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError("");
    try {
      const response = await fetch(`/api/conversations/with/${encodeURIComponent(thread.key)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error("send failed");
      const saved = (await response.json()) as ThreadMessage;
      setMessages((current) => [...current, { ...saved, mine: true }]);
      setDraft("");
    } catch {
      setSendError(t("sendError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <aside
          data-testid="chat-dock"
          className="animate-dock-in fixed right-0 top-0 z-[60] flex w-full flex-col border-l border-border bg-elevated pt-[env(safe-area-inset-top)] shadow-2xl bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-0 lg:w-[360px]"
        >
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
            {thread ? (
              <button
                type="button"
                aria-label={t("back")}
                className="grid size-9 cursor-pointer place-items-center rounded-full hover:bg-surface"
                onClick={() => {
                  setListState("loading");
                  setThread(null);
                }}
              >
                <ArrowLeft className="size-4" />
              </button>
            ) : null}
            {thread ? <Avatar name={thread.name} src={thread.avatar} className="size-10 shrink-0 text-base" /> : null}
            <h2 className="min-w-0 flex-1 truncate text-base font-extrabold">{thread ? thread.name : t("title")}</h2>
            <button type="button" aria-label={t("minimize")} className="grid size-9 cursor-pointer place-items-center rounded-full hover:bg-surface" onClick={closeDock}>
              <Minus className="size-4" />
            </button>
            <button type="button" aria-label={t("close")} className="grid size-9 cursor-pointer place-items-center rounded-full hover:bg-surface" onClick={closeDock}>
              <X className="size-4" />
            </button>
          </header>

          {thread ? (
            <>
              <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                {threadState === "loading" && <p className="text-center text-[15px] text-muted">{t("loading")}</p>}
                {threadState === "error" && (
                  <p className="text-center text-[15px] text-muted">{t("threadError")}</p>
                )}
                {threadState === "ready" && messages.length === 0 && (
                  <p className="text-center text-[15px] text-muted">{t("emptyThread")}</p>
                )}
                {messages.map((message) => (
                  <div key={message.id} className={`mt-3 max-w-[85%] ${message.mine ? "ml-auto" : ""}`}>
                    <div className={`rounded-[18px] px-4 py-3 text-[15px] leading-6 ${message.mine ? "bg-primary text-ink" : "bg-surface text-foreground"}`}>
                      {messageBodyParts(message.body).map((part, index) =>
                        part.kind === "link" ? (
                          <Link key={`${message.id}-${index}`} href={part.value} className="font-semibold underline">
                            {part.value}
                          </Link>
                        ) : (
                          <span key={`${message.id}-${index}`}>{part.value}</span>
                        ),
                      )}
                    </div>
                    {message.offer && (
                      <div className="mt-2 rounded-[18px] bg-ink p-3 text-white">
                        <p className="text-base font-extrabold">{message.offer.title}</p>
                        <p className="mt-1 text-[15px] text-white/70">{brl(message.offer.priceCents)}</p>
                        {!message.offer.purchased && (
                          <Link href={`/checkout?kind=post&id=${message.offer.postId}&creator=${thread.key}&return=${encodeURIComponent(pathname)}`} className="mt-2 block cursor-pointer text-[15px] font-bold underline">
                            {t("unlock", { price: brl(message.offer.priceCents) })}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="flex shrink-0 items-center gap-2 border-t border-border p-4">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("placeholder")}
                  autoComplete="off"
                  className="h-12 min-w-0 flex-1 rounded-full bg-surface/80 px-4 text-[15px] outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button type="submit" size="icon" aria-label={t("send")} disabled={sending || draft.trim().length === 0}>
                  <Send className="size-4" />
                </Button>
              </form>
              {sendError && <p className="px-4 pb-3 text-[15px] text-muted">{t("sendError")}</p>}
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pb-3">
              <DockNotifications />
              {listState === "loading" && <p className="px-4 py-8 text-center text-[15px] text-muted">{t("loading")}</p>}
              {listState === "error" && (
                <div className="px-4 py-8 text-center">
                  <p className="text-[15px] text-muted">{t("listError")}</p>
                  <button
                    type="button"
                    className="mt-3 cursor-pointer text-xs font-medium text-muted hover:text-foreground"
                    onClick={() => {
                      setListState("loading");
                      setListAttempt((value) => value + 1);
                    }}
                  >
                    {t("retry")}
                  </button>
                </div>
              )}
              {listState === "ready" && items.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <MessageCircle className="mx-auto size-6 text-muted" />
                  <p className="mt-3 text-base font-extrabold">{t("emptyTitle")}</p>
                  <p className="mt-1 text-[15px] leading-6 text-muted">{t("emptyBody")}</p>
                </div>
              )}
              {listState === "ready" &&
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left hover:bg-surface/70"
                    onClick={() => openChat({ key: creatorKey(item), name: item.creatorName, avatar: item.creatorAvatar })}
                  >
                    <Avatar name={item.creatorName} src={item.creatorAvatar} className="size-12 shrink-0 text-base" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-base ${item.unread > 0 ? "font-extrabold" : "font-semibold"}`}>{item.creatorName}</span>
                      <span className={`mt-1 block truncate text-[15px] leading-5 ${item.unread > 0 ? "font-semibold text-foreground" : "text-muted"}`}>
                        {item.preview || t("newConversation")}
                      </span>
                    </span>
                    {item.unread > 0 && <i className="size-2.5 shrink-0 rounded-full bg-primary" aria-label={t("unreadDot")} />}
                  </button>
                ))}
            </div>
          )}
          <footer className="shrink-0 border-t border-border px-4 py-2">
            <Link
              href={thread ? `/chat/${encodeURIComponent(thread.key)}` : "/chat"}
              aria-label={t("openInbox")}
              title={t("openInbox")}
              className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
            >
              <Expand className="size-3" />
              {t("openInbox")}
            </Link>
          </footer>
        </aside>
      )}

      {!open && !onChat && (
        <div className={`fixed right-4 z-50 flex items-end gap-3 lg:right-6 ${lift}`}>
          {previews.length > 0 && (
            <div className="flex max-h-[50vh] flex-col-reverse gap-2 overflow-y-auto">
              {previews.map((item) => {
                const key = previewConversationKey(item);
                return (
                  <div key={key} data-testid="chat-bubble-preview" className="animate-chat-preview w-[min(340px,calc(100vw-7.5rem))] rounded-2xl border border-border bg-elevated p-4 shadow-xl lg:w-[340px]">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                        onClick={() => openChat({ key: creatorKey(item), name: item.creatorName, avatar: item.creatorAvatar })}
                      >
                        <Avatar name={item.creatorName} src={item.creatorAvatar} className="size-12 shrink-0 text-base" />
                        <span className="min-w-0">
                          <span className="block truncate text-base font-extrabold">{item.creatorName}</span>
                          <span className="mt-1 line-clamp-3 text-[15px] leading-5 text-muted">{item.preview || previewFallback}</span>
                        </span>
                      </button>
                      <button type="button" aria-label={t("close")} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface" onClick={() => dismissStickyPreview(key)}>
                        <X className="size-4" />
                      </button>
                    </div>
                    <Link href="/chat" className="mt-2 inline-block cursor-pointer text-xs font-medium text-muted hover:text-foreground">
                      {t("seeAll")}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
          <button
            key={previews[0]?.id ?? "bubble"}
            type="button"
            data-testid="chat-bubble"
            aria-label={unread > 0 ? t("bubbleUnread", { count: unread }) : t("title")}
            className={`relative grid size-[58px] shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-ink shadow-xl lg:size-16 ${previews.length > 0 ? "animate-chat-pop" : ""}`}
            onClick={openList}
          >
            <MessageCircle className="size-[26px] lg:size-7" />
            {unread > 0 && (
              <span data-testid="chat-bubble-badge" className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-black leading-5 text-white lg:min-w-6 lg:text-xs lg:leading-6">
                {unreadBadge(unread)}
              </span>
            )}
          </button>
        </div>
      )}
    </>
  );
}
