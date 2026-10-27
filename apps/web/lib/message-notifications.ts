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
export const DISMISSED_PREVIEW_KEY = "patrocino-dismissed-preview-ids";
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
let storageBound = false;
const stickyListeners = new Set<() => void>();

export function undismissedPreviews<T extends { id: string }>(items: readonly T[], dismissed: ReadonlySet<string>) {
  return items.filter((item) => !dismissed.has(item.id));
}

function readDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISMISSED_PREVIEW_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissedIds(ids: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  const values = [...ids].slice(-200);
  window.localStorage.setItem(DISMISSED_PREVIEW_KEY, JSON.stringify(values));
}

export function dismissedPreviewIds() {
  return readDismissedIds();
}

function rememberDismissed(ids: readonly string[]) {
  if (ids.length === 0) return;
  const dismissed = readDismissedIds();
  for (const id of ids) dismissed.add(id);
  writeDismissedIds(dismissed);
}

function readStoredPreviews() {
  if (typeof window === "undefined") return emptyPreviews;
  const stored = window.localStorage.getItem(PREVIEW_SESSION_KEY) ?? window.sessionStorage.getItem(PREVIEW_SESSION_KEY);
  const decoded = decodeStickyPreviews(stored);
  if (decoded.length > 0 && !window.localStorage.getItem(PREVIEW_SESSION_KEY)) {
    window.localStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(decoded));
  }
  return decoded.length ? decoded : emptyPreviews;
}

function bindStorage() {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== PREVIEW_SESSION_KEY && event.key !== DISMISSED_PREVIEW_KEY) return;
    stickyHydrated = true;
    stickyPreviews = readStoredPreviews();
    stickyListeners.forEach((listener) => listener());
  });
}

function rememberSticky(next: IncomingMessage[]) {
  stickyPreviews = next.length ? next : emptyPreviews;
  stickyHydrated = true;
  if (typeof window !== "undefined") {
    if (stickyPreviews.length === 0) window.localStorage.removeItem(PREVIEW_SESSION_KEY);
    else window.localStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(stickyPreviews));
    window.sessionStorage.removeItem(PREVIEW_SESSION_KEY);
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
  bindStorage();
  if (!stickyHydrated) {
    stickyHydrated = true;
    stickyPreviews = readStoredPreviews();
  }
  return stickyPreviews;
}

export function getServerStickyPreviews() {
  return emptyPreviews;
}

export function upsertStickyPreviews(items: readonly IncomingMessage[]) {
  const fresh = undismissedPreviews(items, readDismissedIds());
  if (fresh.length === 0) return;
  rememberSticky(stackMessagePreviews(getStickyPreviews(), fresh));
}

export function dismissStickyPreview(key: string) {
  const current = getStickyPreviews();
  const removed = current.filter(
    (item) => previewConversationKey(item) === key || item.creatorId === key || item.creatorUsername === key,
  );
  rememberDismissed(removed.map((item) => item.id));
  rememberSticky(dismissMessagePreview(current, key));
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
