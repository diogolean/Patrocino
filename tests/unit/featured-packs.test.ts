import { describe, expect, it } from "vitest";
import { packCheckoutHref, parseFeaturedPacks } from "../../apps/web/lib/featured-packs";

describe("featured packs on the home page", () => {
  it("keeps valid packs with the visitor currency and drops broken rows", () => {
    const parsed = parseFeaturedPacks({
      currency: "BRL",
      items: [
        { id: "p1", name: "Pack exclusivo", priceCents: 14900, itemCount: 22, username: "sarah-mitchell", creatorName: "Sarah Mitchell", avatarUrl: "" },
        { id: "p2", name: "x", priceCents: 0, username: "roberta-rose" },
        { id: "p3", name: "x", priceCents: 100, username: "../admin" },
      ],
    });
    expect(parsed?.currency).toBe("BRL");
    expect(parsed?.items.map((item) => item.id)).toEqual(["p1"]);
    expect(parseFeaturedPacks({ currency: "USD", items: [] })?.items).toEqual([]);
    expect(parseFeaturedPacks(null)).toBeNull();
  });

  it("links each pack to the creator's pack checkout", () => {
    expect(packCheckoutHref({ id: "p1", username: "sarah-mitchell" })).toBe(
      "/checkout?kind=pack&id=p1&creator=sarah-mitchell&return=/creator/sarah-mitchell",
    );
  });
});
