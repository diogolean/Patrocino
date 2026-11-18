import { describe, expect, it } from "vitest";
import { hasFeaturedRank, orderFeaturedGallery } from "../../packages/core/src/profile-gallery";

const row = (
  id: string,
  visibility: string,
  publishedAt: string,
  featuredRank: number | null = null,
  kind: "IMAGE" | "VIDEO" = "IMAGE",
) => ({
  id,
  visibility,
  publishedAt,
  featuredRank,
  media: [{ kind }],
});

describe("gallery featured order", () => {
  it("leaves the current order untouched when no post has a rank", () => {
    const rows = [
      row("newer-locked", "PPV", "2026-06-01"),
      row("older-free", "FREE", "2026-01-01"),
      row("middle", "SUBSCRIBERS", "2026-03-01"),
    ];
    expect(hasFeaturedRank(rows)).toBe(false);
    expect(orderFeaturedGallery(rows).map((item) => item.id)).toEqual(rows.map((item) => item.id));
  });

  it("keeps one free tile per row, interleaves locked videos, and pages without gaps", () => {
    const free = Array.from({ length: 7 }, (_, index) => row(`free-${index}`, "FREE", `2026-07-${String(7 - index).padStart(2, "0")}`));
    const rankedVideos = [1, 2, 3, 4].map((rank) => row(`video-${rank}`, "PPV", `2026-05-0${rank}`, rank, "VIDEO"));
    const extraVideos = Array.from({ length: 3 }, (_, index) => row(`video-extra-${index}`, "PPV", `2026-06-${String(10 - index).padStart(2, "0")}`, null, "VIDEO"));
    const rankedPhotos = [5, 6, 7, 8].map((rank) => row(`photo-${rank}`, "SUBSCRIBERS", `2026-04-0${rank - 4}`, rank));
    const extraPhotos = Array.from({ length: 8 }, (_, index) => row(`photo-extra-${index}`, "SUBSCRIBERS", `2026-03-${String(20 - index).padStart(2, "0")}`));
    const rows = [...extraPhotos, ...rankedVideos, ...free, ...extraVideos, ...rankedPhotos];
    const ordered = orderFeaturedGallery(rows, "sophie-bennet");
    expect(orderFeaturedGallery(rows, "sophie-bennet").map((item) => item.id)).toEqual(ordered.map((item) => item.id));

    const firstNine = ordered.slice(0, 9).map((item) => item.id);
    expect(firstNine).toEqual(["free-0", "video-1", "photo-5", "photo-6", "photo-7", "free-1", "video-2", "free-2", "photo-8"]);
    expect(firstNine.filter((id) => id.startsWith("free-"))).toHaveLength(3);
    expect(ordered.slice(0, 3).filter((item) => item.media[0]?.kind === "VIDEO")).toHaveLength(1);
    expect(ordered.slice(3, 6).filter((item) => item.media[0]?.kind === "VIDEO")).toHaveLength(0);
    expect(ordered.slice(6, 9).filter((item) => item.media[0]?.kind === "VIDEO")).toHaveLength(1);

    expect(ordered).toHaveLength(rows.length);
    expect(new Set(ordered.map((item) => item.id)).size).toBe(rows.length);
    const pageSize = 9;
    const pages = [ordered.slice(0, pageSize), ordered.slice(pageSize, pageSize * 2), ordered.slice(pageSize * 2)];
    const paged = pages.flat().map((item) => item.id);
    expect(paged).toEqual(ordered.map((item) => item.id));
    expect(new Set(paged).size).toBe(rows.length);
  });
});
