type UnreadSnapshot = { count: number };

const serverSnapshot: UnreadSnapshot = { count: 0 };
let snapshot: UnreadSnapshot = serverSnapshot;
const listeners = new Set<() => void>();

export function subscribeUnread(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getUnreadSnapshot() {
  return snapshot;
}

export function getServerUnreadSnapshot() {
  return serverSnapshot;
}

export function setUnreadCount(count: number) {
  const next = Math.max(0, Math.trunc(count));
  if (snapshot.count === next) return;
  snapshot = { count: next };
  listeners.forEach((listener) => listener());
}

export function unreadBadge(count: number) {
  if (count > 9) return "9+";
  return String(count);
}
