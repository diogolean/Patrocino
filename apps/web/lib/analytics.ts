/** Google Analytics 4 (gtag) helpers. Consent Mode v2 starts denied; the cookie banner choice updates it. */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-DKVQZBEHY6";

type Gtag = (...args: unknown[]) => void;

function gtag(...args: unknown[]) {
  if (typeof window === "undefined" || !GA_ID) return;
  const fn = (window as unknown as { gtag?: Gtag }).gtag;
  if (fn) fn(...args);
}

export function trackEvent(name: string, params: Record<string, string | number | boolean | undefined> = {}) {
  gtag("event", name, params);
}

export function updateAnalyticsConsent(choice: { analytics: boolean; marketing: boolean }) {
  const ads = choice.marketing ? "granted" : "denied";
  gtag("consent", "update", {
    analytics_storage: choice.analytics ? "granted" : "denied",
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  });
}

/** Inline bootstrap placed before gtag.js: queue, Consent Mode v2 defaults (denied), config (initial page_view; enhanced measurement covers navigations). */
export function gaBootstrap(id: string) {
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});gtag('js',new Date());gtag('config',${JSON.stringify(id)});`;
}

export const AFFILIATE_EVENT_COOKIE = "patrocino_aff_evt";
