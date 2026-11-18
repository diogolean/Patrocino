import { describe, expect, it } from "vitest";
import { hasFeaturedRank, orderFeaturedGallery } from "../../packages/core/src/profile-gallery";

const row = (id: string, visibility: string, publishedAt: string, featuredRank: number | null = null) => ({
  id,
  visibility,
  publishedAt,
  featuredRank,
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

  it("puts free teasers first, then ranked posts, then the rest by published date", () => {
    const rows = [
      row("old-free", "FREE", "2026-01-01"),
      row("new-locked", "PPV", "2026-06-01"),
      row("featured-video", "PPV", "2026-02-01", 2),
      row("featured-photo", "SUBSCRIBERS", "2026-03-01", 1),
      row("new-free", "FREE", "2026-05-01"),
    ];
    expect(orderFeaturedGallery(rows).map((item) => item.id)).toEqual([
      "new-free",
      "old-free",
      "featured-photo",
      "featured-video",
      "new-locked",
    ]);
  });
});
