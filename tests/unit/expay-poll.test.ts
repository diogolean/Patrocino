import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PIX_POLL_BACKOFF_AFTER_MS,
  PIX_POLL_INTERVAL_MS,
  clearPendingExpayCharge,
  isExpayTerminalStatus,
  paymentAlertsToShow,
  pendingChargeOutcome,
  pixPollDelay,
  readPendingExpayCharge,
  readSeenPaymentAlerts,
  rememberPendingExpayCharge,
  rememberSeenPaymentAlert,
} from "../../apps/web/lib/pix-poll";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("pix confirmation polling", () => {
  it("polls every 2 seconds and backs off after about 5 minutes", () => {
    expect(PIX_POLL_INTERVAL_MS).toBe(2_000);
    expect(pixPollDelay(0)).toBe(2_000);
    expect(pixPollDelay(PIX_POLL_BACKOFF_AFTER_MS - 1)).toBe(2_000);
    expect(pixPollDelay(PIX_POLL_BACKOFF_AFTER_MS)).toBe(10_000);
    expect(pixPollDelay(PIX_POLL_BACKOFF_AFTER_MS + 10 * 60 * 1000)).toBe(30_000);
  });

  it("keeps a pending charge id and clears it when that charge finishes", () => {
    const storage = memoryStorage();
    rememberPendingExpayCharge(storage, "ch_123", "2026-10-30T00:00:00.000Z");
    expect(readPendingExpayCharge(storage)).toEqual({ chargeId: "ch_123", savedAt: "2026-10-30T00:00:00.000Z" });
    clearPendingExpayCharge(storage, "other");
    expect(readPendingExpayCharge(storage)?.chargeId).toBe("ch_123");
    clearPendingExpayCharge(storage, "ch_123");
    expect(readPendingExpayCharge(storage)).toBeNull();
  });

  it("ignores a stored value that is not a charge", () => {
    const storage = memoryStorage();
    storage.setItem("patrocino-pending-expay-charge", "{");
    expect(readPendingExpayCharge(storage)).toBeNull();
  });

  it("confirms access and drops a terminal charge that never opened access", () => {
    expect(pendingChargeOutcome({ status: "pending", accessActive: false })).toBe("pending");
    expect(pendingChargeOutcome({ status: "paid", accessActive: true })).toBe("confirmed");
    expect(pendingChargeOutcome({ status: "expired", accessActive: false })).toBe("drop");
    expect(isExpayTerminalStatus("canceled")).toBe(true);
    expect(isExpayTerminalStatus("pending")).toBe(false);
  });

  it("translates the waiting notice and the confirmed toast", () => {
    const files = readdirSync("apps/web/messages").filter((file) => file.endsWith(".json"));
    expect(files.sort()).toEqual(["de.json", "en.json", "es.json", "fr.json", "pt-BR.json"]);
    const catalogs = files.map((file) => JSON.parse(readFileSync(`apps/web/messages/${file}`, "utf8")) as { checkout: Record<string, string> });
    expect(catalogs.find((catalog) => catalog.checkout.waitForConfirmation.startsWith("Aguarde"))?.checkout.waitForConfirmation).toBe(
      "Aguarde a confirmação do pagamento, não feche esta tela",
    );
    for (const catalog of catalogs) {
      expect(catalog.checkout.waitForConfirmation.length).toBeGreaterThan(10);
      expect(catalog.checkout.waitUpToTwoMinutes.length).toBeGreaterThan(10);
      expect(catalog.checkout.confirmedPayment.length).toBeGreaterThan(5);
    }
    const pt = JSON.parse(readFileSync("apps/web/messages/pt-BR.json", "utf8")) as {
      checkout: { confirmedPayment: string; confirmedAccess: string };
    };
    expect(pt.checkout.confirmedPayment).toBe("Pagamento confirmado");
    expect(pt.checkout.confirmedAccess).toBe("Pagamento confirmado / acesso liberado");
    const phrases = catalogs.map((catalog) => catalog.checkout.confirmedAccess);
    expect(new Set(phrases).size).toBe(5);
  });

  it("alerts on a paid charge from local storage or the account, including the next visit", () => {
    const seen = new Set<string>();
    const open = paymentAlertsToShow({
      stored: { chargeId: "local", status: "pending", accessActive: false },
      remote: [{ chargeId: "account", status: "paid", accessActive: true }],
      seen,
    });
    expect(open.watch).toEqual(["local"]);
    expect(open.confirm).toEqual(["account"]);

    const storage = memoryStorage();
    rememberSeenPaymentAlert(storage, "account");
    const again = paymentAlertsToShow({
      stored: null,
      remote: [{ chargeId: "account", status: "paid", accessActive: true }],
      seen: readSeenPaymentAlerts(storage),
    });
    expect(again.confirm).toEqual([]);
  });
});
