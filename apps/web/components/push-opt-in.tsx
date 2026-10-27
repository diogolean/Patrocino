"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { PUSH_CHOICE_KEY, needsHomeScreenInstall } from "@/lib/message-notifications";
import { readPushConfig, registerPush } from "@/lib/push-browser";

type Phase = "pending" | "ask" | "ios" | "denied" | "unavailable";

function subscribePushChoice(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("patrocino:push-choice", callback);
  return () => window.removeEventListener("patrocino:push-choice", callback);
}

function readPushChoice() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PUSH_CHOICE_KEY);
}

function rememberPushChoice(value: "enabled" | "dismissed") {
  window.localStorage.setItem(PUSH_CHOICE_KEY, value);
  window.dispatchEvent(new Event("patrocino:push-choice"));
}

export function PushOptIn({ className = "" }: { className?: string }) {
  const t = useTranslations("notifications");
  const choice = useSyncExternalStore(subscribePushChoice, readPushChoice, () => null);
  const [phase, setPhase] = useState<Phase>("pending");

  useEffect(() => {
    if (choice === "enabled" || choice === "dismissed") return;
    let cancel = false;
    const ios = needsHomeScreenInstall({
      userAgent: window.navigator.userAgent,
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      iosStandalone: (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
      maxTouchPoints: window.navigator.maxTouchPoints,
    });
    void readPushConfig()
      .then((config) => {
        if (cancel) return;
        if (!config.enabled) return;
        if (ios) {
          setPhase("ios");
          return;
        }
        if ("Notification" in window && Notification.permission === "denied") {
          setPhase("denied");
          return;
        }
        setPhase("ask");
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [choice]);

  function dismiss() {
    rememberPushChoice("dismissed");
  }

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
    rememberPushChoice("enabled");
  }

  if (choice === "enabled" || choice === "dismissed" || phase === "pending") return null;

  return (
    <aside data-testid="push-opt-in" className={`rounded-[24px] border border-border bg-elevated p-4 text-left shadow-sm ${className}`}>
      <p className="text-sm font-extrabold">{t("title")}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted">{t("body")}</p>
      {phase === "ios" && (
        <p data-testid="push-ios-hint" className="mt-3 text-[11px] font-semibold text-foreground">
          {t("iosHint")}
        </p>
      )}
      {phase === "denied" && <p className="mt-3 text-[11px] font-semibold text-foreground">{t("denied")}</p>}
      {phase === "unavailable" && <p className="mt-3 text-[11px] font-semibold text-foreground">{t("unavailable")}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {phase === "ask" && (
          <Button size="sm" type="button" onClick={() => void enable()}>
            {t("enable")}
          </Button>
        )}
        <Button size="sm" type="button" variant="ghost" onClick={dismiss}>
          {t("later")}
        </Button>
      </div>
    </aside>
  );
}
