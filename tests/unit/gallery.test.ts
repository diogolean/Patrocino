import { describe, expect, it } from "vitest";
import {
  buildProfileGallery,
  formatActiveUntil,
  formatDuration,
  interleaveMedia,
  mergeGallery,
  profileVideoCount,
  renewPlan,
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

  it("spreads videos through the posts grid from a stable creator seed", () => {
    const photos = Array.from({ length: 40 }, (_, index) => ({ id: `photo-${index}` }));
    const clips = Array.from({ length: 4 }, (_, index) => ({ id: `clip-${index}` }));
    const mixed = interleaveMedia(photos, clips, "creator-sarah");
    expect(interleaveMedia(photos, clips, "creator-sarah")).toEqual(mixed);
    expect(mixed[0]?.id).toBe("photo-0");
    const positions = mixed.flatMap((item, index) => (item.id.startsWith("clip-") ? [index] : []));
    expect(positions).toHaveLength(4);
    let previous = -1;
    for (const position of positions) {
      const gap = position - previous - 1;
      expect(gap).toBeGreaterThanOrEqual(4);
      expect(gap).toBeLessThanOrEqual(8);
      previous = position;
    }
    const pageSize = 9;
    expect(mixed.slice(0, pageSize).concat(mixed.slice(pageSize, pageSize * 2))).toEqual(mixed.slice(0, pageSize * 2));
    expect(interleaveMedia(photos, [], "creator-sarah").map((item) => item.id)).toEqual(photos.map((item) => item.id));
    expect(interleaveMedia([], clips, "creator-sarah")).toEqual(clips);

    const posts = [
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `photo-${index}`,
        mediaType: "image",
        publishedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      })),
      {
        id: "fixture-video",
        mediaType: "video",
        publishedAt: new Date(Date.UTC(2026, 2, 1)).toISOString(),
      },
    ];
    const subscriber = [video("ppv-new", new Date(Date.UTC(2026, 3, 1)).toISOString())];
    const grid = buildProfileGallery("posts", posts, subscriber, "creator-sarah");
    expect(grid[0]).toMatchObject({ kind: "post", post: { mediaType: "image" } });
    const videos = buildProfileGallery("videos", posts, subscriber, "creator-sarah");
    expect(videos).toHaveLength(2);
    expect(videos.every((entry) => entry.kind === "video" || entry.post.mediaType === "video")).toBe(true);
    expect(videos[0]).toMatchObject({ kind: "video", video: { id: "ppv-new" } });
    expect(buildProfileGallery("media", posts, subscriber, "creator-sarah")[0]).toMatchObject({ kind: "video" });
  });

  it("refuses permanent original folders on the public media route", () => {
    expect(publicMediaAllowed(["generated", "creator-sarah-avatar.jpg"])).toBe(true);
    expect(publicMediaAllowed(["uploads", "creator", "previews", "sample.jpg"])).toBe(true);
    expect(publicMediaAllowed(["uploads", "creator", "public", "original.jpg"])).toBe(false);
    expect(publicMediaAllowed(["uploads", "creator", "private", "original.mp4"])).toBe(false);
    expect(publicMediaAllowed(["..", "etc", "passwd"])).toBe(false);
  });
});
