import { database } from "@mimelux/db/runtime";
import {
  EXPAY_DEFAULT_BASE_URL,
  ExpayError,
  createExpayClient,
  syncChargeFromExpay,
  type ExpayClient,
  type PaymentStore,
} from "@mimelux/core/expay";
import { notifyUnsentPaidCharges } from "./buyer-notice";
import { createPrismaPaymentStore } from "./expay-store";
import { logPayment } from "./payment-log";

export const EXPAY_PENDING_WINDOW_MS = 48 * 60 * 60 * 1000;
export const EXPAY_SYNC_INTERVAL_MS = 30_000;

export async function listPendingExpayChargeIds(now = new Date()) {
  const since = new Date(now.getTime() - EXPAY_PENDING_WINDOW_MS);
  const rows = await database.paymentRecord.findMany({
    where: {
      provider: "expay",
      status: "pending",
      createdAt: { gt: since },
    },
    select: { providerChargeId: true },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  return rows.map((row) => row.providerChargeId);
}

export async function reconcilePendingExpayCharges(input: {
  client: ExpayClient;
  store: PaymentStore;
  now?: Date;
  listIds?: (now: Date) => Promise<string[]>;
}) {
  const now = input.now ?? new Date();
  const ids = await (input.listIds ?? listPendingExpayChargeIds)(now);
  let synced = 0;
  for (const chargeId of ids) {
    try {
      await syncChargeFromExpay(input.client, input.store, chargeId);
      synced += 1;
    } catch (error) {
      logPayment("payment.sync.failed", {
        provider: "expay",
        chargeId,
        reason: error instanceof ExpayError ? error.message : error instanceof Error ? error.message : "sync_failed",
      });
    }
  }
  return { checked: ids.length, synced };
}

export async function runExpayPaymentSync(now = new Date()) {
  const apiKey = process.env.EXPAY_API_KEY?.trim();
  const reconciled = apiKey
    ? await reconcilePendingExpayCharges({
        now,
        client: createExpayClient({
          apiKey,
          baseUrl: process.env.EXPAY_BASE_URL || EXPAY_DEFAULT_BASE_URL,
        }),
        store: createPrismaPaymentStore(),
      })
    : { checked: 0, synced: 0 };
  const notices = await notifyUnsentPaidCharges(now, EXPAY_PENDING_WINDOW_MS);
  return { ...reconciled, ...notices };
}

let workerStarted = false;
let workerRunning = false;

export function startExpaySyncWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const tick = () => {
    if (workerRunning) return;
    workerRunning = true;
    void runExpayPaymentSync()
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        workerRunning = false;
      });
  };
  tick();
  const timer = setInterval(tick, EXPAY_SYNC_INTERVAL_MS);
  timer.unref();
}
