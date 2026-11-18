import { describe, expect, it } from "vitest";
import { checkoutSurface } from "../../apps/web/lib/payment-surface";

describe("checkout demo mode", () => {
  it("does not show demo UI before the provider response", () => {
    expect(checkoutSurface(null)).toBe("pending");
  });

  it("shows live checkout when stripe or pix is enabled", () => {
    expect(checkoutSurface({ expay: true, stripe: true })).toBe("live");
    expect(checkoutSurface({ expay: false, stripe: true })).toBe("live");
    expect(checkoutSurface({ expay: true, stripe: false })).toBe("live");
  });

  it("shows demo only when the response says no real provider is configured", () => {
    expect(checkoutSurface({ expay: false, stripe: false })).toBe("demo");
  });
});
