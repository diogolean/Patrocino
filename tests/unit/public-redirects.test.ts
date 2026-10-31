import { describe, expect, it } from "vitest";
import { affiliateDestination, resolveAffiliateRedirect } from "../../apps/web/lib/affiliate-redirect";
import { googleAuthorizeUrl } from "../../apps/web/lib/google-start";
import { shownCaption } from "../../apps/web/lib/public-caption";

describe("public Google start", () => {
  it("redirects to the public /v1 path instead of the internal API host", () => {
    const previous = process.env.WEB_ORIGIN;
    process.env.WEB_ORIGIN = "https://patrocino.com";
    try {
      const request = new Request("http://api:3334/api/auth/google/start?next=/checkout&role=creator", {
        headers: { cookie: "mimelux_attr=" + encodeURIComponent(JSON.stringify({ code: "ezequiel", clickId: "clk_1", slug: "luna", subId: "direct", clickedAt: "2026-10-31T00:00:00.000Z" })) },
      });
      const target = googleAuthorizeUrl(request);
      expect(target.origin).toBe("https://patrocino.com");
      expect(target.pathname).toBe("/v1/auth/google/start");
      expect(target.searchParams.get("next")).toBe("/checkout");
      expect(target.searchParams.get("role")).toBe("CREATOR");
      expect(target.searchParams.get("clickId")).toBe("clk_1");
      expect(target.href).not.toContain("api:3334");
    } finally {
      process.env.WEB_ORIGIN = previous;
    }
  });
});

describe("affiliate redirect", () => {
  it("sends a tracked click to the requested creator and keeps the cookie payload", async () => {
    const result = await resolveAffiliateRedirect({
      code: "ezequiel",
      requestedCreator: "lunaferraz",
      subId: "qa",
      secure: true,
      record: async () => ({
        clickId: "clk_9",
        code: "ezequiel",
        creatorUsername: "other",
        clickedAt: "2026-10-31T00:00:00.000Z",
      }),
    });
    expect(result.location).toBe("/creator/lunaferraz?ref=ezequiel&sub=qa");
    expect(result.cookie?.name).toBe("mimelux_attr");
    expect(result.cookie?.options.httpOnly).toBe(true);
    expect(result.cookie?.options.maxAge).toBe(60 * 60 * 24 * 30);
    expect(result.cookie?.value).toContain("clk_9");
    expect(result.cookie?.value).toContain("lunaferraz");
  });

  it("uses the assigned creator when the link has no creator in the path", () => {
    expect(affiliateDestination({ recordedCreator: "albina-schneider" })).toBe("/creator/albina-schneider");
    expect(affiliateDestination({})).toBe("/topcreators?tab=top-creators");
  });

  it("does not set a cookie when the click API misses", async () => {
    const result = await resolveAffiliateRedirect({
      code: "missing",
      secure: false,
      record: async () => null,
    });
    expect(result.location).toBe("/topcreators?tab=top-creators");
    expect(result.cookie).toBeNull();
  });
});

describe("logged-in captions", () => {
  it("replaces video titles and filename photo captions", () => {
    const video = (n: number) => `Vídeo exclusivo #${n}`;
    const photo = (n: number) => `Foto exclusiva #${n}`;
    expect(shownCaption({ caption: "clip.mp4", video: true, index: 3, videoLabel: video, photoLabel: photo })).toBe("Vídeo exclusivo #3");
    expect(shownCaption({ caption: "IMG_2044.JPG", video: false, index: 2, videoLabel: video, photoLabel: photo })).toBe("Foto exclusiva #2");
    expect(shownCaption({ caption: "Domingo no parque", video: false, index: 1, videoLabel: video, photoLabel: photo })).toBe("Domingo no parque");
  });
});
