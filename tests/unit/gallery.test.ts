import { describe, expect, it } from "vitest";
import {
  PROFILE_GALLERY_COLUMNS,
  buildProfileGallery,
  formatActiveUntil,
  formatDuration,
  layoutGalleryRows,
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

  it("puts one video on every other posts row and keeps the column for a viewer", () => {
    const columns = PROFILE_GALLERY_COLUMNS;
    expect(columns).toBe(3);
    const photos = Array.from({ length: 12 }, (_, index) => ({ id: `photo-${index}` }));
    const clips = Array.from({ length: 3 }, (_, index) => ({ id: `clip-${index}` }));
    const mixed = layoutGalleryRows(photos, clips, "creator-sarah", columns);
    expect(layoutGalleryRows(photos, clips, "creator-sarah", columns)).toEqual(mixed);
    expect(mixed).toHaveLength(photos.length + clips.length);
    for (let row = 0; row < 5; row += 1) {
      const slice = mixed.slice(row * columns, row * columns + columns);
      const videoCount = slice.filter((item) => item.id.startsWith("clip-")).length;
      expect(videoCount).toBe(row % 2 === 0 ? 1 : 0);
    }
    expect(mixed.filter((item) => item.id.startsWith("photo-")).map((item) => item.id)).toEqual(photos.map((item) => item.id));
    expect(mixed.filter((item) => item.id.startsWith("clip-")).map((item) => item.id)).toEqual(clips.map((item) => item.id));
    const pageSize = 9;
    expect(mixed.slice(0, pageSize).concat(mixed.slice(pageSize, pageSize * 2))).toEqual(mixed.slice(0, pageSize * 2));

    const slots = new Set<number>();
    for (let seed = 0; seed < 24; seed += 1) {
      const order = layoutGalleryRows(photos, clips, `viewer-${seed}`, columns);
      const slot = order.findIndex((item) => item.id === "clip-0");
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(columns);
      const second = order.findIndex((item) => item.id === "clip-1");
      expect(second).toBeGreaterThanOrEqual(columns * 2);
      expect(second).toBeLessThan(columns * 3);
      slots.add(slot);
    }
    expect(slots.size).toBe(columns);

    const wider = layoutGalleryRows(photos, clips.slice(0, 1), "creator-sarah", 4);
    expect(wider.slice(0, 4).filter((item) => item.id.startsWith("clip-"))).toHaveLength(1);
    expect(wider.slice(4, 8).every((item) => item.id.startsWith("photo-"))).toBe(true);

    const restPhotos = layoutGalleryRows(photos, clips.slice(0, 1), "creator-sarah", columns);
    expect(restPhotos.slice(columns).every((item) => item.id.startsWith("photo-"))).toBe(true);
    const short = layoutGalleryRows(photos.slice(0, 2), clips, "creator-sarah", columns);
    expect(short.slice(0, columns).filter((item) => item.id.startsWith("clip-"))).toHaveLength(1);
    expect(short.slice(-2).map((item) => item.id)).toEqual(["clip-1", "clip-2"]);
    expect(layoutGalleryRows(photos, [], "creator-sarah").map((item) => item.id)).toEqual(photos.map((item) => item.id));
    expect(layoutGalleryRows([], clips, "creator-sarah")).toEqual(clips);

    const posts = [
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `photo-${index}`,
        mediaType: "image",
        publishedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      })),
      {
        id: "fixture-video",
        mediaType: "video",
        visibility: "public",
        publishedAt: new Date(Date.UTC(2026, 2, 1)).toISOString(),
      },
    ];
    const images = posts.filter((item) => item.mediaType === "image");
    expect(buildProfileGallery("posts", images, [], "albina")).toEqual(mergeGallery(images, []));
    const subscriber = [video("ppv-new", new Date(Date.UTC(2026, 3, 1)).toISOString())];
    const grid = buildProfileGallery("posts", posts, subscriber, "creator-sarah");
    expect(buildProfileGallery("posts", posts, subscriber, "creator-sarah")).toEqual(grid);
    const lockedAt = grid.findIndex((entry) => entry.kind === "video" && entry.video.id === "ppv-new");
    expect(lockedAt).toBeGreaterThanOrEqual(0);
    expect(lockedAt).toBeLessThan(columns);
    expect(grid.slice(0, columns).filter((entry) => entry.kind === "video" || entry.post.mediaType === "video")).toHaveLength(1);
    expect(grid.slice(columns, columns * 2).every((entry) => entry.kind === "post" && entry.post.mediaType === "image")).toBe(true);
    const freeAt = grid.findIndex((entry) => entry.kind === "post" && entry.post.id === "fixture-video");
    expect(freeAt).toBeGreaterThanOrEqual(columns * 2);
    expect(freeAt).toBeLessThan(columns * 3);
    expect(grid.slice(0, pageSize).concat(grid.slice(pageSize, pageSize * 2))).toEqual(grid.slice(0, pageSize * 2));

    const bought = [{ ...subscriber[0]!, id: "bought", purchased: true }];
    const open = buildProfileGallery("posts", images, bought, "creator-sarah");
    const boughtAt = open.findIndex((entry) => entry.kind === "video" && entry.video.id === "bought");
    expect(boughtAt).toBeGreaterThanOrEqual(0);
    expect(boughtAt).toBeLessThan(columns);
    const lockedPost = [
      ...images,
      {
        id: "locked-clip",
        mediaType: "video",
        visibility: "subscriber",
        publishedAt: new Date(Date.UTC(2026, 2, 1)).toISOString(),
      },
    ];
    const fromPost = buildProfileGallery("posts", lockedPost, [], "creator-sarah");
    const postSlot = fromPost.findIndex((entry) => entry.kind === "post" && entry.post.id === "locked-clip");
    expect(postSlot).toBeGreaterThanOrEqual(0);
    expect(postSlot).toBeLessThan(columns);
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
