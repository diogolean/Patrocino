import { describe, expect, it } from "vitest";
import { currencyFromHeaderMap } from "../../apps/api/src/http/visitor-currency";
import { realSubscriberWhere } from "../../apps/api/src/modules/creators/subscribers";
import { creatorSlugFromPath, withCampaignQuery } from "../../apps/web/lib/creator-route";
import { publicOgSource } from "../../apps/web/lib/creator-og";

describe("visitor currency headers", () => {
  it("prices a US visitor in USD even when the browser language is English and there is no locale cookie", () => {
    expect(currencyFromHeaderMap({ "cf-ipcountry": "US", "accept-language": "en" })).toBe("USD");
    expect(currencyFromHeaderMap({ "x-patrocino-country": "US", "accept-language": "en" })).toBe("USD");
  });

  it("prices Brazil in BRL and keeps an explicit currency choice", () => {
    expect(currencyFromHeaderMap({ "cf-ipcountry": "BR", "accept-language": "en" })).toBe("BRL");
    expect(currencyFromHeaderMap({ "cf-ipcountry": "BR", "x-patrocino-currency": "USD" })).toBe("USD");
    expect(currencyFromHeaderMap({ "accept-language": "en" })).toBe("USD");
  });
});

describe("creator routes", () => {
  it("reads the slug from the profile, short link, and link-in-bio paths", () => {
    expect(creatorSlugFromPath("/creator/sophie-bennet")).toBe("sophie-bennet");
    expect(creatorSlugFromPath("/l/sophie-bennet")).toBe("sophie-bennet");
    expect(creatorSlugFromPath("/sophie-bennet")).toBe("sophie-bennet");
    expect(creatorSlugFromPath("/checkout")).toBeNull();
    expect(creatorSlugFromPath("/sophie-bennet/4embsj")).toBeNull();
  });

  it("carries ref, sub, and utm onto the link-in-bio buttons, and the cookie when ref is missing", () => {
    const search = new URLSearchParams("ref=4embsj&sub=story&utm_source=ig&utm_campaign=launch");
    expect(withCampaignQuery("/creator/sophie-bennet", search, null)).toBe(
      "/creator/sophie-bennet?ref=4embsj&sub=story&utm_source=ig&utm_campaign=launch",
    );
    expect(withCampaignQuery("/checkout?kind=subscription&id=sophie-bennet", new URLSearchParams(), { code: "4embsj", subId: "story" })).toBe(
      "/checkout?kind=subscription&id=sophie-bennet&ref=4embsj&sub=story",
    );
  });
});

describe("public share images", () => {
  it("rejects a locked original and keeps a public cover", () => {
    expect(publicOgSource("/media/uploads/sophie/private/posters/clear.jpg")).toBeNull();
    expect(publicOgSource("/media/uploads/sophie/posters/cover.v2.jpg")).toBe("/media/uploads/sophie/posters/cover.v2.jpg");
    expect(publicOgSource(null)).toBeNull();
  });
});

describe("subscriber count", () => {
  it("counts only real active subscriptions", () => {
    expect(realSubscriberWhere(["sophie"])).toMatchObject({
      status: "ACTIVE",
      isDemo: false,
      creatorId: { in: ["sophie"] },
      fan: { isDemo: false, role: { not: "ADMIN" } },
    });
  });
});
