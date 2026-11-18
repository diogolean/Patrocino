import { expect, test } from "@playwright/test";

test("a seeded creator appears in search and locks subscriber photos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/busca");
  await page.getByPlaceholder("Busque por nome, @usuário ou tema").fill("Albina");
  const card = page.getByTestId("search-results").getByRole("link", { name: /Albina Schneider/ });
  await expect(card).toBeVisible();
  const cover = card.locator("img").first();
  await expect(cover).toHaveAttribute("src", "/media/models/albina-schneider/002.jpg?v=2");
  await expect(cover).toHaveClass(/object-cover/);
  await expect(cover).toHaveAttribute("loading", "lazy");

  await card.click();
  await expect(page).toHaveURL(/\/creator\/albina-schneider/);
  await expect(page.getByRole("heading", { name: "Albina Schneider" })).toBeVisible();
  const locked = page.locator('[data-testid="profile-post"][data-locked="true"]').first();
  await expect(locked).toBeVisible();
  await expect(locked.locator("img")).not.toHaveClass(/blur-/);
  await expect(locked.locator("img")).toHaveAttribute("src", /\/media\/models\/albina-schneider\/\d+\.jpg\?v=2$/);
  await expect(page.getByText(/WinApp|independente|da casa/i)).toHaveCount(0);

  await page.goto("/topcreators?tab=top-creators");
  await expect(page.getByTestId("ranking-card").first()).toContainText("Albina Schneider");
  await expect(page.getByTestId("ranking-card").nth(8)).toContainText("Taty Moreira");
  await expect(page.getByTestId("ranking-card").nth(9)).toContainText("Luna Ferraz");

  await page.goto("/feed");
  await expect(page.locator("article").first()).toContainText("Albina Schneider");
});
