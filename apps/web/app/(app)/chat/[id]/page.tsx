"use client";

import { useDemoMoney, useMoney } from "@/lib/visitor-currency";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  ImagePlus,
  LockKeyhole,
  MoreVertical,
  Send,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { PushOptIn } from "@/components/push-opt-in";
import { messageBodyParts, resolveChatCreator } from "@/lib/chat-creator";
import { creators, posts } from "@/lib/gateway";
import { readDemo, writeDemo } from "@/lib/demo-store";
import { requestUnreadRefresh, THREAD_REFRESH_EVENT } from "@/lib/message-notifications";

export default function ConversationPage() {
  const money = useMoney();
  const demoMoney = useDemoMoney();
  const t = useTranslations("chatPage");
  const media = useTranslations("media");
  const params = useParams<{ id: string }>();
  const fixture = resolveChatCreator(creators, params.id);
  const [remote, setRemote] = useState<{ id: string; username: string | null; name: string; avatarUrl: string | null } | null>(null);
  const lockedPost = posts.find((item) => item.creatorId === fixture?.id) || posts[0]!;
  const messageId = `message-${fixture?.id ?? params.id}`;
  const [unlocked, setUnlocked] = useState(false);
  const [messages, setMessages] = useState<string[]>(() => readDemo().sentMessages[fixture?.id ?? params.id] ?? []);
  type ThreadMessage = {
    id: string;
    body: string;
    mine?: boolean;
    offer: { postId: string; exclusiveIndex?: number; priceCents: number; currency?: "BRL" | "USD"; purchased: boolean } | null;
  };
  const [thread, setThread] = useState<ThreadMessage[]>([]);

  useEffect(() => {
    let cancel = false;
    const load = () => {
      fetch(`/api/conversations/with/${encodeURIComponent(params.id)}`, { cache: "no-store" })
        .then(async (response) => (response.ok ? response.json() : { messages: [] }))
        .then((payload: { messages?: ThreadMessage[]; creator?: { id: string; username: string | null; name: string; avatarUrl: string | null } | null }) => {
          if (cancel) return;
          setThread(payload.messages ?? []);
          if (payload.creator) setRemote(payload.creator);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancel) requestUnreadRefresh();
        });
    };
    load();
    const onThread = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (key === params.id) load();
    };
    window.addEventListener(THREAD_REFRESH_EVENT, onThread);
    return () => {
      cancel = true;
      window.removeEventListener(THREAD_REFRESH_EVENT, onThread);
    };
  }, [params.id]);

  useEffect(() => {
    const sync = () => setUnlocked(readDemo().unlocks.includes(messageId));
    sync();
    window.addEventListener("mimelux:state", sync);
    return () => window.removeEventListener("mimelux:state", sync);
  }, [messageId]);

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = String(data.get("message") || "").trim();
    if (!body) return;
    const next = [...messages, body];
    setMessages(next);
    const current = readDemo();
    writeDemo({ sentMessages: { ...current.sentMessages, [fixture?.id ?? params.id]: next } });
    form.reset();
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-136px)] w-full max-w-4xl flex-col lg:h-[calc(100dvh-64px)]">
      <header className="flex h-18 shrink-0 items-center gap-3 border-b border-black/5 px-4 sm:px-6">
        <Link href="/chat" className="grid size-10 place-items-center rounded-full hover:bg-black/5"><ArrowLeft className="size-4" /></Link>
        <div className="relative">
          {(fixture?.avatar || remote?.avatarUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fixture?.avatar || remote?.avatarUrl || ""} alt="" className="size-11 rounded-full object-cover" />
          )}
          <i className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-emerald-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1"><h1 className="truncate text-xs font-extrabold">{fixture?.name || remote?.name || t("fallbackName")}</h1>{fixture?.verified && <BadgeCheck className="size-3.5 fill-primary text-white" />}</div>
          <p className="text-[9px] text-emerald-600">{t("online")}</p>
        </div>
        <Button variant="ghost" size="icon"><MoreVertical className="size-4" /></Button>
      </header>
      <PushOptIn className="mx-4 mt-3 sm:mx-6" />

      <section className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_30%_10%,rgba(233,176,167,.12),transparent_18rem)] px-4 py-6 sm:px-7">
        <p className="mx-auto mb-6 w-fit rounded-full bg-surface px-3 py-1 text-[8px] font-semibold text-muted dark:bg-white/5">{t("today")}</p>
        {fixture && <div className="max-w-[78%] rounded-[22px_22px_22px_6px] bg-white p-4 shadow-sm dark:bg-white/8">
          <p className="text-[11px] leading-5">{t("greeting")}</p>
          <span className="mt-2 block text-right text-[8px] text-muted">{t("timeGreeting")}</span>
        </div>}

        {fixture && <div className="mt-3 max-w-[82%] overflow-hidden rounded-[24px_24px_24px_6px] bg-ink text-white shadow-lg">
          <div className="relative h-52 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lockedPost.image} alt={t("exclusiveAlt")} className={`h-full w-full object-cover ${unlocked ? "" : "scale-105 blur-xl opacity-65"}`} />
            {!unlocked && <div className="absolute inset-0 grid place-items-center"><span className="grid size-12 place-items-center rounded-full bg-black/35 backdrop-blur"><LockKeyhole className="size-5" /></span></div>}
          </div>
          <div className="p-4">
            <p className="text-xs font-extrabold">{unlocked ? t("unlockedTitle") : t("lockedTitle")}</p>
            <p className="mt-1 text-[9px] leading-4 text-white/60">{unlocked ? t("unlockedBody") : t("lockedBody")}</p>
            {!unlocked && (
              <Link href={`/checkout?kind=message&id=${messageId}&creator=${fixture.id}&return=/chat/${fixture.id}`}>
                <Button size="sm" className="mt-3 w-full"><Sparkles className="size-3.5" /> {t("unlock", { price: demoMoney(1290) })}</Button>
              </Link>
            )}
            <span className="mt-2 block text-right text-[8px] text-white/40">{t("timeLocked")}</span>
          </div>
        </div>}

        {thread.map((message) => (
          <div key={message.id} data-testid="chat-sequence-message" className={`mt-3 max-w-[82%] ${message.mine ? "ml-auto" : ""}`}>
            <div className={`p-4 shadow-sm ${message.mine ? "rounded-[22px_22px_6px_22px] bg-primary text-ink" : "rounded-[22px_22px_22px_6px] bg-white dark:bg-white/8"}`}>
              <p className="text-[11px] leading-5">
                {messageBodyParts(message.body).map((part, index) =>
                  part.kind === "link" ? (
                    <Link key={`${message.id}-${index}`} href={part.value} className="font-semibold underline">
                      {part.value}
                    </Link>
                  ) : (
                    <span key={`${message.id}-${index}`}>{part.value}</span>
                  ),
                )}
              </p>
            </div>
            {message.offer && (
              <div data-testid="chat-ppv-offer" className="mt-2 overflow-hidden rounded-[24px_24px_24px_6px] bg-ink p-4 text-white shadow-lg">
                <p className="text-xs font-extrabold">{media("exclusiveVideo", { n: message.offer.exclusiveIndex ?? 1 })}</p>
                <p className="mt-1 text-[9px] text-white/60">{money(message.offer.priceCents, message.offer.currency)}</p>
                {!message.offer.purchased && (
                  <Link href={`/checkout?kind=post&id=${message.offer.postId}&creator=${params.id}&return=/chat/${params.id}`}>
                    <Button size="sm" className="mt-3 w-full"><Sparkles className="size-3.5" /> {t("unlock", { price: money(message.offer.priceCents, message.offer.currency) })}</Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}

        {fixture && (
          <div className="ml-auto mt-4 max-w-[78%] rounded-[22px_22px_6px_22px] bg-primary p-4 text-ink">
            <p className="text-[11px] leading-5">{t("reply")}</p><span className="mt-2 block text-right text-[8px] text-black/45">{t("timeReply")}</span>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className="ml-auto mt-3 max-w-[78%] rounded-[22px_22px_6px_22px] bg-primary p-4 text-ink">
            <p className="text-[11px] leading-5">{message}</p><span className="mt-2 block text-right text-[8px] text-black/45">{t("sentNow")}</span>
          </div>
        ))}
      </section>

      <form onSubmit={send} className="flex shrink-0 items-center gap-2 border-t border-black/5 bg-background p-3 sm:px-5">
        <button type="button" className="grid size-10 place-items-center rounded-full text-muted hover:bg-black/5"><ImagePlus className="size-5" /></button>
        <input name="message" placeholder={t("composerPlaceholder")} autoComplete="off" className="h-11 min-w-0 flex-1 rounded-full bg-surface/65 px-4 text-xs outline-none focus:ring-2 focus:ring-primary/30 dark:bg-white/5" />
        <Button type="submit" size="icon" aria-label={t("send")}><Send className="size-4" /></Button>
      </form>
    </div>
  );
}
