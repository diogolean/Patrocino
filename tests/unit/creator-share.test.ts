import { describe, expect, it } from "vitest";
import { creatorOgHtml, creatorShare, isSocialCrawler } from "../../apps/web/lib/creator-share";

describe("creator share cards", () => {
  it("recognizes the crawlers that do not follow the affiliate redirect", () => {
    expect(isSocialCrawler("facebookexternalhit/1.1")).toBe(true);
    expect(isSocialCrawler("Twitterbot/1.0")).toBe(true);
    expect(isSocialCrawler("WhatsApp/2.23")).toBe(true);
    expect(isSocialCrawler("Mozilla/5.0")).toBe(false);
  });

  it("builds a creator card from the public name and bio, not a paid poster", () => {
    const share = creatorShare({
      name: "Sophie Bennet",
      bio: "Perto de quem inspira.",
      slug: "sophie-bennet",
      origin: "https://patrocino.com",
    });
    expect(share.title).toBe("Sophie Bennet | Patrocino");
    expect(share.description).toBe("Perto de quem inspira.");
    expect(share.url).toBe("https://patrocino.com/creator/sophie-bennet");
    expect(share.image).toBe("https://patrocino.com/creator/sophie-bennet/opengraph-image");
    expect(share.image).not.toContain("/private/");
    const html = creatorOgHtml(share);
    expect(html).toContain('property="og:title" content="Sophie Bennet | Patrocino"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).not.toContain("/private/");
  });
});
