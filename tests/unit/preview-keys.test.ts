import { describe, expect, it } from "vitest";
import { guestLockedVideoUrls, nextPreviewClipKey, posterKeyFor, previewKeyFor, regeneratedPreviewKey } from "../../apps/api/src/modules/media/derivative-access";
import { clipStartSeconds, previewBlurFilter, previewBlurSigma, previewBlurSigmaVideo, previewClipArgs } from "../../apps/api/src/modules/media/derivatives";
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

  it("rebuilds previews onto v3 so an older cached preview is never reused", () => {
    expect(regeneratedPreviewKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: "uploads/c/previews/m.jpg" })).toBe(
      "uploads/c/previews/m.v3.jpg",
    );
    expect(regeneratedPreviewKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: "uploads/c/previews/m.v2.jpg" })).toBe(
      "uploads/c/previews/m.v3.jpg",
    );
    expect(regeneratedPreviewKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: "uploads/c/previews/m.v3.jpg" })).toBeNull();
    expect(
      regeneratedPreviewKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: "uploads/c/previews/m.v3.jpg", force: true }),
    ).toBe("uploads/c/previews/m.v4.jpg");
  });
});

describe("preview blur", () => {
  it("uses a lighter still sigma, a lighter video sigma, and bakes in darkening", () => {
    expect(previewBlurSigma("")).toBe(6);
    expect(previewBlurSigmaVideo("")).toBe(4);
    expect(previewBlurSigma("12")).toBe(12);
    expect(previewBlurFilter(6)).toBe("gblur=sigma=6,eq=brightness=-0.15,scale=720:-2");
    expect(previewBlurFilter(previewBlurSigmaVideo("4"))).toContain("sigma=4");
  });
});

describe("locked video teasers", () => {
  it("builds a muted faststart clip from the middle of the file", () => {
    expect(clipStartSeconds(10)).toBeCloseTo(2.5);
    expect(clipStartSeconds(2)).toBe(0);
    const args = previewClipArgs({ inputPath: "/tmp/source.mp4", outputPath: "/tmp/out.mp4", startSeconds: 2.5, sigma: 4 });
    expect(args).toContain("-ss");
    expect(args).toContain("2.500");
    expect(args).toContain("-an");
    expect(args.join(" ")).toContain("gblur=sigma=4,eq=brightness=-0.15");
    expect(args).toContain("libx264");
    expect(args).toContain("30");
    expect(args).toContain("+faststart");
    expect(args.at(-1)).toBe("/tmp/out.mp4");
    expect(args.filter((arg) => arg === "/tmp/source.mp4")).toHaveLength(1);
  });

  it("versions the clip key and does not rewrite an existing one", () => {
    expect(nextPreviewClipKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: null })).toBe(
      "uploads/c/previews/m.clip.v1.mp4",
    );
    expect(nextPreviewClipKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: "uploads/c/previews/m.clip.v1.mp4" })).toBeNull();
    expect(
      nextPreviewClipKey({ creatorId: "c", mediaId: "m", creatorStatus: "ACTIVE", currentKey: "uploads/c/previews/m.clip.v1.mp4", force: true }),
    ).toBe("uploads/c/previews/m.clip.v2.mp4");
  });

  it("never gives a guest the original file or the sharp poster", () => {
    const urls = guestLockedVideoUrls({
      previewKey: "uploads/c/previews/m.v3.jpg",
      posterKey: "uploads/c/private/posters/m.jpg",
      storageKey: "uploads/c/private/original.mp4",
      previewClipKey: "uploads/c/previews/m.clip.v1.mp4",
    });
    expect(urls.posterUrl).toBeNull();
    expect(urls.fileUrl).toBeNull();
    expect(urls.previewUrl).toBe("/media/uploads/c/previews/m.v3.jpg");
    expect(urls.clipUrl).toBe("/media/uploads/c/previews/m.clip.v1.mp4");
    const packed = JSON.stringify(urls);
    expect(packed).not.toContain("/private/");
    expect(packed).not.toContain("original.mp4");
    expect(guestLockedVideoUrls({
      previewKey: "uploads/c/private/previews/m.jpg",
      posterKey: "uploads/c/private/posters/m.jpg",
      storageKey: "uploads/c/private/original.mp4",
      previewClipKey: "uploads/c/private/previews/m.clip.v1.mp4",
    })).toEqual({ previewUrl: null, clipUrl: null, posterUrl: null, fileUrl: null });
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
