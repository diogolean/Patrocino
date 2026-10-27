export const UNREAD_POLL_MS = 12_000;
export const PUSH_CHOICE_KEY = "patrocino-push-choice";
export const UNREAD_REFRESH_EVENT = "patrocino:unread";
export const THREAD_REFRESH_EVENT = "patrocino:thread";
export const INCOMING_MESSAGE_EVENT = "patrocino:incoming";

let dockCreator: string | null = null;

export function setDockCreator(key: string | null) {
  dockCreator = key;
}

export function getDockCreator() {
  return dockCreator;
}

export function activeCreatorKey(pathname: string, dockKey: string | null = null) {
  return openCreatorKey(pathname) ?? dockKey;
}

export function publishIncoming(items: IncomingMessage[]) {
  if (typeof window === "undefined" || items.length === 0) return;
  window.dispatchEvent(new CustomEvent(INCOMING_MESSAGE_EVENT, { detail: items }));
}

export const OPEN_THREAD_EVENT = "patrocino:open-thread";
export const PREVIEW_SESSION_KEY = "patrocino-open-previews";
export const MESSAGE_TOAST_DURATION = Number.POSITIVE_INFINITY;

export function requestOpenThread(item: IncomingMessage) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_THREAD_EVENT, { detail: item }));
}

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
    visible: unseen.filter((item) => !matchesOpenCreator(item, openKey)),
  };
}

export function previewConversationKey(item: { creatorId: string; creatorUsername?: string | null }) {
  return item.creatorUsername || item.creatorId;
}

export function stackMessagePreviews<T extends { creatorId: string; creatorUsername?: string | null; createdAt: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const item of current) byKey.set(previewConversationKey(item), item);
  for (const item of incoming) {
    const key = previewConversationKey(item);
    const existing = byKey.get(key);
    if (!existing || item.createdAt >= existing.createdAt) byKey.set(key, item);
  }
  return [...byKey.values()].sort((left, right) => {
    const byTime = right.createdAt.localeCompare(left.createdAt);
    return byTime || previewConversationKey(left).localeCompare(previewConversationKey(right));
  });
}

export function dismissMessagePreview<T extends { creatorId: string; creatorUsername?: string | null }>(
  current: readonly T[],
  key: string,
) {
  return current.filter((item) => previewConversationKey(item) !== key && item.creatorId !== key && item.creatorUsername !== key);
}

export function retainUnreadPreviews<T extends { creatorId: string; creatorUsername?: string | null }>(
  current: readonly T[],
  unread: readonly { creatorId: string; creatorUsername?: string | null }[],
) {
  const open = new Set<string>();
  for (const item of unread) {
    if (item.creatorId) open.add(item.creatorId);
    if (item.creatorUsername) open.add(item.creatorUsername);
  }
  return current.filter((item) => open.has(item.creatorId) || (item.creatorUsername ? open.has(item.creatorUsername) : false));
}

function isStickyPreview(value: unknown): value is IncomingMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as IncomingMessage;
  return typeof item.id === "string" && typeof item.creatorId === "string" && typeof item.creatorName === "string" && typeof item.preview === "string" && typeof item.createdAt === "string";
}

export function decodeStickyPreviews(raw: string | null): IncomingMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStickyPreview);
  } catch {
    return [];
  }
}

const emptyPreviews: IncomingMessage[] = [];
let stickyPreviews: IncomingMessage[] = emptyPreviews;
let stickyHydrated = false;
const stickyListeners = new Set<() => void>();

function rememberSticky(next: IncomingMessage[]) {
  stickyPreviews = next.length ? next : emptyPreviews;
  stickyHydrated = true;
  if (typeof window !== "undefined") {
    if (stickyPreviews.length === 0) window.sessionStorage.removeItem(PREVIEW_SESSION_KEY);
    else window.sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(stickyPreviews));
  }
  stickyListeners.forEach((listener) => listener());
}

export function subscribeStickyPreviews(listener: () => void) {
  stickyListeners.add(listener);
  return () => {
    stickyListeners.delete(listener);
  };
}

export function getStickyPreviews() {
  if (typeof window === "undefined") return emptyPreviews;
  if (!stickyHydrated) {
    stickyHydrated = true;
    stickyPreviews = decodeStickyPreviews(window.sessionStorage.getItem(PREVIEW_SESSION_KEY));
    if (stickyPreviews.length === 0) stickyPreviews = emptyPreviews;
  }
  return stickyPreviews;
}

export function getServerStickyPreviews() {
  return emptyPreviews;
}

export function upsertStickyPreviews(items: readonly IncomingMessage[]) {
  if (items.length === 0) return;
  rememberSticky(stackMessagePreviews(getStickyPreviews(), items));
}

export function dismissStickyPreview(key: string) {
  rememberSticky(dismissMessagePreview(getStickyPreviews(), key));
}

export function syncStickyWithUnread(unread: readonly { creatorId: string; creatorUsername?: string | null }[]) {
  const current = getStickyPreviews();
  const next = retainUnreadPreviews(current, unread);
  if (next.length === current.length && next.every((item, index) => item === current[index])) return;
  rememberSticky(next);
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
