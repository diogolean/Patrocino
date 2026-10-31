import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const shots = "/opt/cursor/artifacts/screenshots";

async function shot(page: Page, name: string) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
}

async function acceptCookies(page: Page) {
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("mimelux-demo") || "{}");
    localStorage.setItem("mimelux-demo", JSON.stringify({ ...current, cookieAccepted: true }));
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/auth?route=sign-in");
  await page.evaluate(() => localStorage.clear());
});

test("FanMimo aliases reach the same homes as the original demo accounts", async ({ page }) => {
  await page.getByLabel("Email ou CPF").fill("fan@fanmimo.com.br");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/topcreators/);

  await page.goto("/auth?route=sign-in");
  await page.getByLabel("Email ou CPF").fill("criadora@fanmimo.com");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);

  await page.goto("/auth?route=sign-in");
  await page.getByLabel("Email ou CPF").fill("afiliado@fanmimo.com.br");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/afiliados$/);
});

test("login and profile show Patrocino and not the previous brands", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await acceptCookies(page);
  await page.goto("/auth?route=sign-in");
  await expect(page.getByText("Patrocino").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("FanMimo");
  await expect(page.locator("body")).not.toContainText("Mimelux", { ignoreCase: false });
  await expect(page).toHaveTitle(/Patrocino/);
  await shot(page, "v7-login-desktop");
  await page.getByTestId("creator-hero").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, "v7-home-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await acceptCookies(page);
  await page.goto("/auth?route=sign-in");
  await expect(page.getByText("Patrocino").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Entendi" })).toHaveCount(0);
  await shot(page, "v7-login-mobile");
  await page.getByTestId("creator-hero").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, "v7-home-mobile");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  await page.goto("/creator/lunaferraz");
  await expect(page.locator("body")).not.toContainText("FanMimo");
  await expect(page.locator("body")).not.toContainText("Mimelux", { ignoreCase: false });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "v7-profile-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.getByTestId("profile-avatar").scrollIntoViewIfNeeded();
  await shot(page, "v7-profile-mobile");
});
