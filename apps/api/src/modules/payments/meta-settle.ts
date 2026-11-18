import { AsyncLocalStorage } from "node:async_hooks";
import { queueMetaPurchase } from "./meta-report";

const storage = new AsyncLocalStorage<string[]>();

/** Called only after a purchase row flips to PAID inside the open settlement context. */
export function noteMetaPurchase(purchaseId: string) {
  storage.getStore()?.push(purchaseId);
}

/** Runs the settlement, then queues Conversions API after the transaction commits. */
export async function withMetaSettlement<T>(fn: () => Promise<T>): Promise<T> {
  const settled: string[] = [];
  try {
    return await storage.run(settled, fn);
  } finally {
    for (const id of new Set(settled)) queueMetaPurchase(id);
  }
}
