"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AFFILIATE_EVENT_COOKIE, GA_ID, trackEvent, updateAnalyticsConsent } from "@/lib/analytics";
import { readConsent, subscribeConsent } from "@/lib/consent";

/** Page views (initial + app-router history changes) come from GA4 enhanced measurement. Sends consent updates and the one-shot affiliate click event. */
export function GoogleAnalytics() {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => null);

  useEffect(() => {
    if (!GA_ID || !consent) return;
    updateAnalyticsConsent(consent);
  }, [consent]);

  useEffect(() => {
    const prefix = `${AFFILIATE_EVENT_COOKIE}=`;
    const part = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
    if (!part) return;
    document.cookie = `${AFFILIATE_EVENT_COOKIE}=; path=/; max-age=0; samesite=lax`;
    const [creator, code, pack] = decodeURIComponent(part.slice(prefix.length)).split("|");
    if (creator && code) trackEvent("affiliate_click", { creator, link_code: code, link_type: pack === "1" ? "pack" : "creator" });
  }, []);

  return null;
}
