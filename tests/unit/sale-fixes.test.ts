import { describe, expect, it } from "vitest";
import { currencyFromHeaderMap } from "../../apps/api/src/http/visitor-currency";
import { countryFromHeaders, currencyFromHeaders } from "../../packages/core/src/currency";
import { realSubscriberWhere } from "../../apps/api/src/modules/creators/subscribers";
import { creatorSlugFromPath, withCampaignQuery } from "../../apps/web/lib/creator-route";
import { publicOgSource } from "../../apps/web/lib/creator-og";

describe("visitor currency headers", () => {
  it("prices a US visitor in USD from any country header, ahead of language", () => {
    expect(currencyFromHeaderMap({ "cf-ipcountry": "US", "accept-language": "pt-BR" })).toBe("USD");
    expect(currencyFromHeaderMap({ "x-vercel-ip-country": "US", "accept-language": "pt-BR" })).toBe("USD");
    expect(currencyFromHeaderMap({ "x-patrocino-country": "US", "accept-language": "pt-BR" })).toBe("USD");
    expect(currencyFromHeaderMap({ "cf-ipcountry": "US", "x-patrocino-country": "BR", "accept-language": "pt-BR" })).toBe("USD");
    expect(countryFromHeaders({ get: (name) => (name === "x-vercel-ip-country" ? "DE" : null) })).toBe("DE");
  });

  it("uses Accept-Language only when no country header exists, and defaults to BRL", () => {
    expect(currencyFromHeaderMap({ "accept-language": "en-US,en;q=0.9" })).toBe("USD");
    expect(currencyFromHeaderMap({ "accept-language": "pt-BR,en;q=0.8" })).toBe("BRL");
    expect(currencyFromHeaderMap({ "accept-language": "pt-PT" })).toBe("BRL");
    expect(currencyFromHeaderMap({})).toBe("BRL");
    expect(currencyFromHeaders(undefined)).toBe("BRL");
  });

  it("keeps an explicit currency choice above the country", () => {
    expect(currencyFromHeaderMap({ "cf-ipcountry": "BR", "accept-language": "en" })).toBe("BRL");
    expect(currencyFromHeaderMap({ "cf-ipcountry": "BR", "x-patrocino-currency": "USD" })).toBe("USD");
    expect(currencyFromHeaderMap({ "cf-ipcountry": "US", cookie: "mimelux-currency=BRL" })).toBe("BRL");
    expect(currencyFromHeaderMap({ "cf-ipcountry": "US", cookie: "other=1; mimelux-currency=USD" })).toBe("USD");
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
    const campaign = new URLSearchParams("utm_source=ig&utm_medium=story&utm_campaign=launch&utm_content=bio&utm_term=br");
    const cookie = { code: "4embsj", subId: "story" };
    const returnTo = withCampaignQuery("/l/sophie-bennet", campaign, cookie);
    expect(returnTo).toBe("/l/sophie-bennet?utm_source=ig&utm_medium=story&utm_campaign=launch&utm_content=bio&utm_term=br&ref=4embsj&sub=story");
    const subscribe = withCampaignQuery(
      `/checkout?${new URLSearchParams({ kind: "subscription", id: "sophie-bennet", return: returnTo }).toString()}`,
      campaign,
      cookie,
    );
    const params = new URL(subscribe, "https://patrocino.local").searchParams;
    expect(params.get("utm_source")).toBe("ig");
    expect(params.get("utm_campaign")).toBe("launch");
    expect(params.get("utm_content")).toBe("bio");
    expect(params.get("ref")).toBe("4embsj");
    expect(params.get("return")).toContain("utm_source=ig");
    expect(params.get("return")).toContain("utm_campaign=launch");
    expect(params.get("return")).toContain("ref=4embsj");
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
