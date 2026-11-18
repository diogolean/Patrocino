import { describe, expect, it } from "vitest";
import { posterKeyFor, previewKeyFor, regeneratedPreviewKey } from "../../apps/api/src/modules/media/derivative-access";
import { previewBlurFilter, previewBlurSigma } from "../../apps/api/src/modules/media/derivatives";
import { isCountableSubscriber } from "../../apps/api/src/modules/creators/subscribers";

describe("versioned public posters", () => {
  it("publishes a free poster on a new key and never reuses a 404-prone url", () => {
    expect(posterKeyFor({ creatorId: "c", mediaId: "m", visibility: "FREE", creatorStatus: "ACTIVE" })).toBe(
      "uploads/c/posters/m.v2.jpg",
    );
    expect(
      posterKeyFor({
        creatorId: "c",
        mediaId: "m",
        visibility: "FREE",
        creatorStatus: "ACTIVE",
        currentKey: "uploads/c/private/posters/m.v2.jpg",
      }),
    ).toBe("uploads/c/posters/m.v3.jpg");
    expect(
      previewKeyFor({
        creatorId: "c",
        mediaId: "m",
        creatorStatus: "ACTIVE",
        currentKey: "uploads/c/previews/m.v2.jpg",
      }),
    ).toBe("uploads/c/previews/m.v2.jpg");
  });

  it("rebuilds previews onto v2 once, then stops unless forced", () => {
    expect(regeneratedPreviewKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: "uploads/c/previews/m.jpg" })).toBe(
      "uploads/c/previews/m.v2.jpg",
    );
    expect(regeneratedPreviewKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: "uploads/c/previews/m.v2.jpg" })).toBeNull();
    expect(
      regeneratedPreviewKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: "uploads/c/previews/m.v2.jpg", force: true }),
    ).toBe("uploads/c/previews/m.v3.jpg");
  });
});

describe("preview blur", () => {
  it("reads one sigma and keeps the blur on the server", () => {
    expect(previewBlurSigma("")).toBe(8);
    expect(previewBlurSigma("12")).toBe(12);
    expect(previewBlurFilter(8)).toBe("gblur=sigma=8,scale=720:-2");
    expect(previewBlurFilter(8)).not.toContain("sigma=18");
  });
});

describe("real subscribers", () => {
  const fan = { status: "ACTIVE", role: "FAN", email: "ana@patrocino.com" };

  it("counts an active fan and skips demo, admin, and test mailboxes", () => {
    expect(isCountableSubscriber(fan)).toBe(true);
    expect(isCountableSubscriber({ ...fan, status: "PENDING" })).toBe(false);
    expect(isCountableSubscriber({ ...fan, subscriptionDemo: true })).toBe(false);
    expect(isCountableSubscriber({ ...fan, fanDemo: true })).toBe(false);
    expect(isCountableSubscriber({ ...fan, role: "ADMIN" })).toBe(false);
    expect(isCountableSubscriber({ ...fan, email: "qa.buyer@patrocino.com" })).toBe(false);
    expect(isCountableSubscriber({ ...fan, email: "buyer@example.com" })).toBe(false);
    expect(isCountableSubscriber({ ...fan, email: "buyer@mimelux.test" })).toBe(false);
  });
});
