import { PUSH_CHOICE_KEY, urlBase64ToUint8Array } from "./message-notifications";

export async function readPushConfig() {
  const response = await fetch("/api/push/vapid", { cache: "no-store" });
  if (!response.ok) return { enabled: false as const, publicKey: null };
  const data = (await response.json().catch(() => ({}))) as { enabled?: boolean; publicKey?: string | null };
  if (!data.enabled || !data.publicKey) return { enabled: false as const, publicKey: null };
  return { enabled: true as const, publicKey: data.publicKey };
}

async function savePushSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
  if (!response.ok) return false;
  const data = (await response.json().catch(() => ({}))) as { enabled?: boolean };
  return data.enabled !== false;
}

export async function registerPush(publicKey: string) {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const ready = await navigator.serviceWorker.ready;
  const current = ready || registration;
  let subscription = await current.pushManager.getSubscription();
  if (!subscription) {
    subscription = await current.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  return savePushSubscription(subscription);
}

export async function resumeStoredPush() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(PUSH_CHOICE_KEY) !== "enabled") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
  const config = await readPushConfig();
  if (!config.enabled || Notification.permission !== "granted") return;
  try {
    await registerPush(config.publicKey);
  } catch (error) {
    console.error(error);
  }
}
