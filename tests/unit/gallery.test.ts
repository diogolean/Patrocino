import { describe, expect, it } from "vitest";
import {
  formatActiveUntil,
  formatDuration,
  mergeGallery,
  profileVideoCount,
  renewPlan,
  viewerHandleLabel,
  type SubscriberVideo,
} from "../../apps/web/lib/gallery";
import { publicMediaAllowed } from "../../apps/web/lib/public-media";

function post(id: string, publishedAt: string) {
  return { id, publishedAt };
}

function video(id: string, publishedAt: string): SubscriberVideo {
  return {
    id,
    mediaId: `media-${id}`,
    caption: id,
    priceCents: 100,
    previewUrl: null,
    purchased: false,
    subscribed: true,
    durationMs: 95_000,
    publishedAt,
  };
}

describe("profile gallery and subscription copy", () => {
  it("mixes subscriber videos into posts by date and keeps the order when dates match", () => {
    const mixed = mergeGallery(
      [post("newer", "2026-10-20T00:00:00.000Z"), post("older", "2026-10-01T00:00:00.000Z")],
      [video("clip", "2026-10-10T00:00:00.000Z"), video("tie", "2026-10-20T00:00:00.000Z")],
    );
    expect(mixed.map((entry) => (entry.kind === "post" ? entry.post.id : entry.video.id))).toEqual([
      "newer",
      "tie",
      "clip",
      "older",
    ]);
  });

  it("formats an active end date and picks the three-month renewal", () => {
    const end = new Date("2026-11-04T15:00:00.000Z");
    const label = `${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}`;
    expect(formatActiveUntil(end.toISOString(), end.getTime() - 1_000)).toBe(label);
    expect(formatActiveUntil(end.toISOString(), end.getTime())).toBeNull();
    expect(formatActiveUntil(null)).toBeNull();
    expect(renewPlan([{ months: 1 }, { months: 12 }, { months: 3 }])?.months).toBe(3);
    expect(renewPlan([{ months: 1 }, { months: 6 }])?.months).toBe(6);
    expect(renewPlan([{ months: 1 }])).toBeNull();
    expect(formatDuration(95_000)).toBe("1:35");
    expect(formatDuration(null)).toBeNull();
  });

  it("counts subscriber videos in the profile header", () => {
    expect(profileVideoCount([{ mediaType: "image" }, { mediaType: "video" }], [{}, {}])).toBe(3);
    expect(profileVideoCount([{ mediaType: "image" }], [])).toBe(0);
  });

  it("keeps the viewer handle safe for a tiled watermark", () => {
    expect(viewerHandleLabel("sarah-mitchell")).toBe("@sarah-mitchell");
    expect(viewerHandleLabel("@fan.demo")).toBe("@fan.demo");
    expect(viewerHandleLabel("<script>")).toBe("@script");
    expect(viewerHandleLabel("")).toBe("");
  });

  it("refuses permanent original folders on the public media route", () => {
    expect(publicMediaAllowed(["generated", "creator-sarah-avatar.jpg"])).toBe(true);
    expect(publicMediaAllowed(["uploads", "creator", "previews", "sample.jpg"])).toBe(true);
    expect(publicMediaAllowed(["uploads", "creator", "public", "original.jpg"])).toBe(false);
    expect(publicMediaAllowed(["uploads", "creator", "private", "original.mp4"])).toBe(false);
    expect(publicMediaAllowed(["..", "etc", "passwd"])).toBe(false);
  });
});
