export const UNREAD_POLL_MS = 12_000;
export const PUSH_CHOICE_KEY = "patrocino-push-choice";
export const UNREAD_REFRESH_EVENT = "patrocino:unread";
export const THREAD_REFRESH_EVENT = "patrocino:thread";

export type IncomingMessage = {
  id: string;
  conversationId: string;
  creatorId: string;
  creatorUsername: string | null;
  creatorName: string;
  creatorAvatar: string | null;
  preview: string;
  createdAt: string;
  url: string;
};

export function openCreatorKey(pathname: string) {
  const match = /^\/chat\/([^/]+)$/.exec(pathname);
  const key = match?.[1];
  if (!key) return null;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

export function matchesOpenCreator(
  item: { creatorId: string; creatorUsername?: string | null },
  openKey: string | null,
) {
  if (!openKey) return false;
  return item.creatorId === openKey || item.creatorUsername === openKey;
}

export function freshMessages<T extends { id: string; creatorId: string; creatorUsername?: string | null }>(
  items: T[],
  seen: ReadonlySet<string>,
  openKey: string | null,
) {
  const unseen = items.filter((item) => !seen.has(item.id));
  return {
    opened: unseen.filter((item) => matchesOpenCreator(item, openKey)),
    visible: unseen.filter((item) => !matchesOpenCreator(item, openKey)).slice(0, 3),
  };
}

export function needsHomeScreenInstall(input: {
  userAgent: string;
  standalone: boolean;
  iosStandalone?: boolean;
  maxTouchPoints?: number;
}) {
  const iphone = /iPhone|iPad|iPod/.test(input.userAgent);
  const ipadOs = /Macintosh/.test(input.userAgent) && (input.maxTouchPoints ?? 0) > 1;
  const installed = input.standalone || input.iosStandalone === true;
  return (iphone || ipadOs) && !installed;
}

export function urlBase64ToUint8Array(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

export function requestUnreadRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UNREAD_REFRESH_EVENT));
}
