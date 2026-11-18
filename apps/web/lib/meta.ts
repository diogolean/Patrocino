import {
  SIGNUP_EVENT_COOKIE,
  attributionCookieAssignment,
  attributionFromSearch,
  browserMetaCommand,
  readCookieValue,
  readMetaPixelId,
  touchFromCookieHeader,
} from "@mimelux/core/attribution";

export const META_PIXEL_ID = readMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID);
const RETURN_KEY = "patrocino_meta_return";

export type MetaPurchase = {
  eventId: string;
  value: number;
  currency: "BRL" | "USD";
  contentId: string;
  subscribe: boolean;
};

type Fbq = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: Fbq;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let granted = false;
const fired = new Set<string>();
const pending: unknown[][] = [];

export function captureLandingAttribution() {
  const existing = touchFromCookieHeader(document.cookie);
  const incoming = attributionFromSearch(new URLSearchParams(window.location.search));
  if (existing || !incoming) return;
  document.cookie = attributionCookieAssignment(incoming, window.location.protocol === "https:");
}

function installStub() {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) {
    const fn = window.fbq as Fbq;
    if (fn.callMethod) fn.callMethod(...args);
    else fn.queue.push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

/** Loads fbq only after marketing consent. Later calls just re-grant. */
export function bootMetaPixel(id: string) {
  if (!id || typeof window === "undefined") return;
  installStub();
  const fbq = window.fbq;
  if (!fbq) return;
  const current = (window as unknown as { __patrocinoPixel?: string }).__patrocinoPixel;
  if (current === id) {
    fbq("consent", "grant");
    granted = true;
    return;
  }
  const fbc = touchFromCookieHeader(document.cookie)?.fbc;
  fbq("consent", "grant");
  fbq("init", id, fbc ? { fbc } : {});
  (window as unknown as { __patrocinoPixel?: string }).__patrocinoPixel = id;
  granted = true;
}

export function setMetaConsent(next: boolean) {
  granted = next;
  if (!next) pending.length = 0;
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("consent", next ? "grant" : "revoke");
}

export function trackMeta(name: "PageView" | "ViewContent" | "CompleteRegistration" | "InitiateCheckout" | "Purchase" | "Subscribe", params: Record<string, unknown> = {}, eventId?: string) {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;
  const command = browserMetaCommand(name, params, eventId);
  if (!granted || !window.fbq) {
    pending.push([...command]);
    return;
  }
  window.fbq(...command);
}

export function flushPendingMeta() {
  if (!granted || typeof window === "undefined" || !window.fbq) return;
  const queued = pending.splice(0);
  for (const command of queued) window.fbq(...command);
}

export function trackPageView() {
  trackMeta("PageView");
}

export function trackPurchaseEvent(detail: MetaPurchase) {
  if (!granted || !detail.eventId || fired.has(detail.eventId)) return false;
  const params = {
    value: detail.value,
    currency: detail.currency,
    content_ids: [detail.contentId],
    content_type: "product",
  };
  trackMeta("Purchase", params, detail.eventId);
  if (detail.subscribe) trackMeta("Subscribe", params, detail.eventId);
  fired.add(detail.eventId);
  return true;
}

export function rememberMetaReturn(detail: MetaPurchase) {
  sessionStorage.setItem(RETURN_KEY, JSON.stringify(detail));
}

export function flushMetaReturn() {
  const raw = sessionStorage.getItem(RETURN_KEY);
  if (!raw) return;
  let detail: MetaPurchase | null = null;
  try {
    const parsed = JSON.parse(raw) as Partial<MetaPurchase>;
    if (parsed.eventId && (parsed.currency === "BRL" || parsed.currency === "USD") && typeof parsed.value === "number" && parsed.contentId) {
      detail = {
        eventId: parsed.eventId,
        value: parsed.value,
        currency: parsed.currency,
        contentId: parsed.contentId,
        subscribe: parsed.subscribe === true,
      };
    }
  } catch {
    detail = null;
  }
  if (!detail) {
    sessionStorage.removeItem(RETURN_KEY);
    return;
  }
  if (trackPurchaseEvent(detail)) sessionStorage.removeItem(RETURN_KEY);
}

export function flushSignupEvent() {
  if (typeof document === "undefined") return;
  if (readCookieValue(document.cookie, SIGNUP_EVENT_COOKIE) !== "1") return;
  if (!granted) return;
  trackMeta("CompleteRegistration", { status: "completed" });
  document.cookie = `${SIGNUP_EVENT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
