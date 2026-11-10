import { expect, test } from "@playwright/test";

const sophie = {
  id: "sophie-draft-v1-creator",
  name: "Sophie Bennet",
  username: "sophie-bennet",
  avatarUrl: "/media/generated/creator-luna-ferraz-avatar.jpg",
  coverUrl: "/media/generated/creator-luna-ferraz-cover.jpg",
  category: "Lifestyle",
  bio: "",
  city: "São Paulo",
  verified: true,
  isFree: false,
  monthlyPriceCents: 800,
  currency: "USD",
  subscriberCount: 0,
  likeCount: 0,
  fictitious: true,
  aiGenerated: true,
  createdAt: "2026-11-10T00:00:00.000Z",
  lead: {
    id: "sophie-lead",
    image: "/media/generated/creator-luna-ferraz-cover.jpg",
    mediaType: "image",
    visibility: "free",
    caption: "Prévia",
    publishedAt: "2026-11-10T00:00:00.000Z",
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mimelux-demo", JSON.stringify({ coachSeen: true }));
  });
  await page.route("**/api/creators", async (route) => {
    if (route.request().method() !== "GET" || new URL(route.request().url()).pathname !== "/api/creators") {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { items: [sophie], nextCursor: null, source: "postgres" } });
  });
  await page.route("**/api/creators/sophie-bennet", async (route) => {
    await route.fulfill({
      json: {
        ...sophie,
        plans: [{ id: "monthly", name: "Mensal", months: 1, chargeCents: 800, promotionPercent: 0 }],
        packs: [{ id: "pack", name: "Pack", priceCents: 4900 }],
        posts: [],
        currency: "USD",
      },
    });
  });
});

test("listings keep fixture creators and add a database-only creator", async ({ page }) => {
  await page.goto("/topcreators?tab=top-creators");
  await page.getByRole("button", { name: "Aceitar todos" }).click();
  await expect(page.getByRole("heading", { name: "Albina Schneider" })).toBeVisible();
  const sophie = page.getByRole("heading", { name: "Sophie Bennet" });
  await sophie.scrollIntoViewIfNeeded();
  await expect(sophie).toBeVisible();
  await page.goto("/busca");
  await expect(page.getByTestId("search-results").getByRole("heading", { name: "Sophie Bennet" })).toBeVisible();
  await expect(page.getByTestId("search-results").getByRole("heading", { name: "Albina Schneider" })).toBeVisible();
});

test("checkout for a database-only creator uses her name and quoted price", async ({ page }) => {
  await page.route("**/api/payments/quote", async (route) => {
    await route.fulfill({ json: { amountCents: 800, currency: "USD", subscriberCents: 800, subscribed: false } });
  });
  await page.goto("/checkout?kind=subscription&id=sophie-bennet&plan=monthly");
  await expect(page.getByText("Sophie Bennet")).toBeVisible();
  await expect(page.getByTestId("checkout-amount")).toContainText("8");
  await expect(page.getByText("Albina Schneider")).toHaveCount(0);
});

test("an unknown creator profile stays a 404", async ({ page }) => {
  const response = await page.goto("/creator/nobody-home-xyz");
  expect(response?.status()).toBe(404);
});
