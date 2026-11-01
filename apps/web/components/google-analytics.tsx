"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AFFILIATE_EVENT_COOKIE, GA_ID, trackEvent, updateAnalyticsConsent } from "@/lib/analytics";
import { readConsent, subscribeConsent } from "@/lib/consent";

/** Sends consent updates, a page_view on every app-router navigation, and the one-shot affiliate click event. */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const search = useSearchParams();
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => null);
  const query = search.toString();

  useEffect(() => {
    if (!GA_ID || !consent) return;
    updateAnalyticsConsent(consent);
  }, [consent]);

  useEffect(() => {
    if (!GA_ID) return;
    trackEvent("page_view", { page_location: window.location.href, page_path: pathname + (query ? `?${query}` : ""), page_title: document.title });
  }, [pathname, query]);

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
