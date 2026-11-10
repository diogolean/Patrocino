import { describe, expect, it } from "vitest";
import { creators } from "../../apps/web/lib/fixtures";
import { mergePublicCreators, parseDatabaseCreators, parseDatabaseProfile } from "../../apps/web/lib/public-catalog";
import { publicOrigin } from "../../apps/web/lib/affiliate-redirect";

describe("public catalog merge", () => {
  it("keeps fixture creators and appends a database-only profile once", () => {
    const sophie = {
      id: "sophie-draft-v1-creator",
      name: "Sophie Bennet",
      username: "sophie-bennet",
      avatar: "/media/uploads/sophie/avatar.jpg",
      cover: "/media/uploads/sophie/cover.jpg",
      category: "Lifestyle",
      bio: "",
      city: "",
      verified: true,
      free: false,
      price: 800,
      subscribers: 0,
      posts: 0,
      fictitious: true,
      aiGenerated: true,
      createdAt: "2026-11-10T00:00:00.000Z",
    };
    const duplicate = { ...creators[0]!, id: "db-copy", name: "From the database" };
    const merged = mergePublicCreators(creators, [duplicate, sophie]);
    expect(merged[0]?.username).toBe(creators[0]?.username);
    expect(merged.filter((item) => item.username === creators[0]?.username)).toHaveLength(1);
    expect(merged.at(-1)?.username).toBe("sophie-bennet");
    expect(merged).toHaveLength(creators.length + 1);
  });

  it("drops private media urls and reads a database profile", () => {
    const parsed = parseDatabaseCreators({
      items: [
        {
          id: "sophie-draft-v1-creator",
          name: "Sophie Bennet",
          username: "sophie-bennet",
          avatarUrl: "/a.jpg",
          coverUrl: "/c.jpg",
          category: "Lifestyle",
          monthlyPriceCents: 800,
          currency: "USD",
          createdAt: "2026-11-10T00:00:00.000Z",
          lead: { id: "p1", image: "/media/uploads/sophie/private/previews/x.jpg", mediaType: "video", visibility: "ppv" },
        },
      ],
    });
    expect(parsed.creators).toHaveLength(1);
    expect(parsed.posts).toHaveLength(0);
    const profile = parseDatabaseProfile({
      id: "sophie-draft-v1-creator",
      name: "Sophie Bennet",
      username: "sophie-bennet",
      avatarUrl: "/a.jpg",
      coverUrl: "/c.jpg",
      monthlyPriceCents: 3900,
      currency: "BRL",
      plans: [{ id: "plan", name: "Mensal", months: 1, chargeCents: 3900, promotionPercent: 0 }],
      packs: [{ id: "pack", name: "Pack", priceCents: 14900 }],
      posts: [
        { id: "photo", image: "/media/uploads/sophie/posters/photo.jpg", mediaType: "image", visibility: "free", caption: "Olá", publishedAt: "2026-11-01T00:00:00.000Z" },
        { id: "secret", image: "/media/uploads/sophie/private/posters/secret.jpg", mediaType: "image", visibility: "subscriber" },
      ],
    });
    expect(profile?.creator.name).toBe("Sophie Bennet");
    expect(profile?.offers.plans[0]?.chargeCents).toBe(3900);
    expect(profile?.posts.map((post) => post.id)).toEqual(["photo"]);
  });

  it("sends affiliate landings to WEB_ORIGIN instead of the bind address", () => {
    const previous = process.env.WEB_ORIGIN;
    process.env.WEB_ORIGIN = "https://patrocino.com";
    try {
      const request = new Request("http://127.0.0.1:3333/sophie-bennet/ab12cd");
      const target = new URL("/creator/sophie-bennet?ref=ab12cd", publicOrigin(request));
      expect(target.origin).toBe("https://patrocino.com");
      expect(target.pathname).toBe("/creator/sophie-bennet");
      expect(request.url).toContain("127.0.0.1");
      expect(target.href).not.toContain("127.0.0.1");
    } finally {
      if (previous === undefined) delete process.env.WEB_ORIGIN;
      else process.env.WEB_ORIGIN = previous;
    }
  });
});
