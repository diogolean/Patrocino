import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";

const shots = "/opt/cursor/artifacts/screenshots";

async function shot(page: Page, name: string) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/auth?route=sign-in");
  await page.evaluate(() => localStorage.clear());
});

test("locale files stay free of gendered creator wording", () => {
  const banned = /criadora|criadoras|créatrice|créatrices|Creatorin|creatress/i;
  for (const file of readdirSync("apps/web/messages")) {
    if (!file.endsWith(".json")) continue;
    expect(readFileSync(`apps/web/messages/${file}`, "utf8"), file).not.toMatch(banned);
  }
});

test("fan login lands on trending creators and the feed stays available", async ({ page }) => {
  await page.getByLabel("Email ou CPF").fill("fan@mimelux.com.br");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/topcreators\?tab=top-creators/);
  await expect(page.getByRole("heading", { name: "Em alta", exact: true })).toBeVisible();
  await expect(page.getByTestId("ranking-likes").first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, "v4-em-alta-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "v4-em-alta-mobile");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator("aside a[href='/feed']").click();
  await expect(page).toHaveURL(/\/feed/);
  await expect(page.getByTestId("post-likes").first()).toBeVisible();
  await expect(page.getByTestId("post-comment").first()).toBeVisible();
});

test("affiliate onboarding selects creators and generates links", async ({ page }) => {
  await page.goto("/auth?route=sign-up&role=affiliate");
  await page.getByLabel("Seu nome").fill("Afiliado V4");
  await page.getByLabel("Email ou CPF").fill("afiliado.v4@mimelux.test");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByTestId("accept-terms").check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/verificacao/);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Verificar e continuar" }).click();
  await expect(page.getByTestId("affiliate-onboarding")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Você divulga. Quem cria publica." })).toBeVisible();
  await page.getByRole("button", { name: /Pular tutorial/ }).click();
  await expect(page).toHaveURL(/\/afiliados/);
  await expect(page.getByTestId("affiliate-no-links")).toBeVisible();
  await page.getByTestId("enable-lunaferraz").click();
  await page.getByTestId("enable-bellamonroe").click();
  await expect(page.getByTestId("affiliate-link")).toHaveCount(2);
  await expect(page.getByTestId("affiliate-link").first()).toContainText("lunaferraz");
  await expect(page.getByTestId("affiliate-link").nth(1)).toContainText("bellamonroe");
  await page.reload();
  await expect(page.getByTestId("enable-lunaferraz")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("affiliate-link")).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("affiliate-mosaic").scrollIntoViewIfNeeded();
  await shot(page, "v4-affiliate-mosaic-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("affiliate-mosaic").scrollIntoViewIfNeeded();
  await shot(page, "v4-affiliate-mosaic-mobile");
});

test("creator profile shows likes and subscriber reviews", async ({ page }) => {
  await page.goto("/creator/lunaferraz");
  await expect(page.getByTestId("profile-likes")).not.toHaveText("0");
  await expect(page.getByTestId("profile-rating")).toBeVisible();
  await expect(page.getByTestId("review-card").first()).toContainText("Acompanhar de perto vale cada detalhe.");
  await expect(page.getByText("Assine para deixar uma avaliação.")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("profile-reviews").scrollIntoViewIfNeeded();
  await shot(page, "v4-profile-reviews-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "Luna Ferraz" }).scrollIntoViewIfNeeded();
  await shot(page, "v4-profile-mobile");
});

test("logged-out marketing hero and editorial render in both viewports", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/auth?route=sign-in");
  await page.getByRole("button", { name: "Só necessários" }).click();
  await page.getByTestId("creator-hero").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Transforme atenção em renda." })).toBeVisible();
  await expect(page.getByTestId("creator-slideshow")).toBeVisible();
  await expect(page.getByTestId("payout-stat")).toHaveCount(0);
  await shot(page, "v4-hero-desktop");
  await page.getByTestId("monetize-section").getByRole("heading", { name: "Monetize com a gente, do seu jeito" }).scrollIntoViewIfNeeded();
  await shot(page, "v4-editorial-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.getByTestId("creator-hero").scrollIntoViewIfNeeded();
  await shot(page, "v4-hero-mobile");
  await page.getByTestId("monetize-section").getByRole("heading", { name: "Monetize com a gente, do seu jeito" }).scrollIntoViewIfNeeded();
  await shot(page, "v4-editorial-mobile");
});

test("switching locale does not bring back gendered creator wording", async ({ page }) => {
  await page.getByRole("main").getByRole("button", { name: "FR", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Transformez l'attention en revenu." })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/criadora|créatrice/i);
  await page.getByRole("main").getByRole("button", { name: "DE", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aus Aufmerksamkeit wird Einkommen." })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/criadora|Creatorin/i);
});
