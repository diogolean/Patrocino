"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { readConsent, subscribeConsent } from "@/lib/consent";
import { META_PIXEL_ID, bootMetaPixel, flushMetaReturn, flushPendingMeta, flushSignupEvent, setMetaConsent, trackPageView } from "@/lib/meta";

/** Loads the Patrocino pixel only after marketing consent, including client navigations. */
export function MetaPixel() {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => null);
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const marketing = Boolean(consent?.marketing);
  const lastPath = useRef("");

  useEffect(() => {
    if (!META_PIXEL_ID) return;
    if (!marketing) {
      setMetaConsent(false);
      return;
    }
    bootMetaPixel(META_PIXEL_ID);
    const path = `${pathname}?${query}`;
    if (lastPath.current !== path) {
      lastPath.current = path;
      trackPageView();
    }
    flushPendingMeta();
    flushSignupEvent();
    if (pathname === "/assinatura/sucesso") flushMetaReturn();
  }, [marketing, pathname, query]);

  return null;
}
