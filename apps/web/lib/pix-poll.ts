export const PIX_POLL_INTERVAL_MS = 2_000;
export const PIX_POLL_BACKOFF_AFTER_MS = 5 * 60 * 1000;
export const PENDING_EXPAY_CHARGE_KEY = "patrocino-pending-expay-charge";

const terminalStatuses = ["paid", "failed", "refunded", "canceled", "expired"] as const;

export type PendingExpayCharge = {
  chargeId: string;
  savedAt: string;
};

export function pixPollDelay(elapsedMs: number) {
  if (elapsedMs < PIX_POLL_BACKOFF_AFTER_MS) return PIX_POLL_INTERVAL_MS;
  if (elapsedMs < PIX_POLL_BACKOFF_AFTER_MS + 10 * 60 * 1000) return 10_000;
  return 30_000;
}

export function isExpayTerminalStatus(status: string) {
  return (terminalStatuses as readonly string[]).includes(status);
}

export function pendingChargeOutcome(charge: { status?: string; accessActive?: boolean }) {
  if (charge.accessActive) return "confirmed" as const;
  if (charge.status && isExpayTerminalStatus(charge.status)) return "drop" as const;
  return "pending" as const;
}

export function rememberPendingExpayCharge(storage: Storage, chargeId: string, savedAt = new Date().toISOString()) {
  const record: PendingExpayCharge = { chargeId, savedAt };
  storage.setItem(PENDING_EXPAY_CHARGE_KEY, JSON.stringify(record));
  return record;
}

export function readPendingExpayCharge(storage: Storage): PendingExpayCharge | null {
  const raw = storage.getItem(PENDING_EXPAY_CHARGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { chargeId?: unknown; savedAt?: unknown };
    if (typeof parsed.chargeId !== "string" || parsed.chargeId.length < 2) return null;
    return {
      chargeId: parsed.chargeId,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function clearPendingExpayCharge(storage: Storage, chargeId?: string) {
  if (!chargeId) {
    storage.removeItem(PENDING_EXPAY_CHARGE_KEY);
    return;
  }
  const current = readPendingExpayCharge(storage);
  if (!current || current.chargeId === chargeId) storage.removeItem(PENDING_EXPAY_CHARGE_KEY);
}

export const PAYMENT_ALERT_SEEN_KEY = "patrocino-payment-alert-seen";

export type AlertCharge = {
  chargeId: string;
  status: string;
  accessActive: boolean;
};

export function readSeenPaymentAlerts(storage: Storage) {
  const raw = storage.getItem(PAYMENT_ALERT_SEEN_KEY);
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 1));
  } catch {
    return new Set<string>();
  }
}

export function rememberSeenPaymentAlert(storage: Storage, chargeId: string) {
  const seen = readSeenPaymentAlerts(storage);
  seen.add(chargeId);
  storage.setItem(PAYMENT_ALERT_SEEN_KEY, JSON.stringify([...seen].slice(-40)));
}

export function paymentAlertsToShow(input: {
  stored: AlertCharge | null;
  remote: AlertCharge[];
  seen: ReadonlySet<string>;
}) {
  const byId = new Map<string, AlertCharge>();
  for (const item of input.remote) byId.set(item.chargeId, item);
  if (input.stored) byId.set(input.stored.chargeId, input.stored);
  const confirm: string[] = [];
  const watch: string[] = [];
  for (const charge of byId.values()) {
    if (input.seen.has(charge.chargeId)) continue;
    const outcome = pendingChargeOutcome(charge);
    if (outcome === "confirmed") confirm.push(charge.chargeId);
    else if (outcome === "pending") watch.push(charge.chargeId);
  }
  return { confirm, watch };
}
