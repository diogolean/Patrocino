import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const shots = "/opt/cursor/artifacts/screenshots/v8";

async function shot(page: Page, name: string) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
}

async function acceptCookies(page: Page) {
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("mimelux-demo") || "{}");
    localStorage.setItem(
      "mimelux-demo",
      JSON.stringify({ ...current, cookieAccepted: true, coachSeen: true }),
    );
  });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth?route=sign-in");
  await page.getByLabel("Email ou CPF").fill(email);
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/auth?route=sign-in");
  await page.evaluate(() => localStorage.clear());
});

test("patrocino.com logins keep the same roles", async ({ page }) => {
  await signIn(page, "fan@patrocino.com");
  await expect(page).toHaveURL(/\/topcreators/);
  await expect(page.getByRole("heading", { name: "Em alta" })).toBeVisible();

  await signIn(page, "criadora@patrocino.com");
  await expect(page).toHaveURL(/\/painel$/);

  await signIn(page, "creator@patrocino.com");
  await expect(page).toHaveURL(/\/painel$/);

  await signIn(page, "afiliado@patrocino.com");
  await expect(page).toHaveURL(/\/afiliados$/);
  await expect(page.getByRole("heading", { name: "Suas divulgações" })).toBeVisible();
});

test("home, login, profile, and logo boards use Patrocino", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await acceptCookies(page);
  await page.goto("/auth?route=sign-in");
  await expect(page.getByLabel("Email ou CPF")).toHaveValue("");
  await page.getByLabel("Email ou CPF").fill("fan@patrocino.com");
  await page.locator('input[name="password"]').fill("mimelux123");
  await expect(page.getByText("Patrocino").first()).toBeVisible();
  await expect(page.getByText("FanMimo")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Mimelux", { ignoreCase: false });
  await expect(page).toHaveTitle(/Patrocino/);
  await expect(page.getByRole("button", { name: "Entendi" })).toHaveCount(0);
  await shot(page, "login");

  await page.getByTestId("creator-hero").scrollIntoViewIfNeeded();
  await page.waitForTimeout(450);
  await shot(page, "home");
  await expect(page.getByTestId("monetize-section")).toContainText("Patrocino");

  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/topcreators/);
  await expect(page.getByRole("heading", { name: "Em alta" })).toBeVisible();
  await expect(page.locator("header p").filter({ hasText: "Patrocino" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  const expand = page.getByRole("button", { name: "Expandir menu lateral" });
  if (await expand.isVisible()) await expand.click();
  await expect(page.locator("aside").getByText("Patrocino")).toBeVisible();
  await page.waitForTimeout(450);
  await shot(page, "em-alta");

  await page.goto("/creator/lunaferraz");
  await expect(page.getByRole("heading", { name: "Luna Ferraz" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pedido especial" })).toBeVisible();
  await expect(page.locator("aside").getByText("Patrocino")).toBeVisible();
  await expect(page.getByText("FanMimo")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, "profile");

  await signIn(page, "afiliado@patrocino.com");
  await expect(page.getByRole("heading", { name: "Suas divulgações" })).toBeVisible();
  await expect(page.getByText("FanMimo")).toHaveCount(0);
  await page.waitForTimeout(400);
  await shot(page, "affiliates");

  await page.goto("/marca");
  await expect(page.getByRole("heading", { name: "Patrocino" })).toBeVisible();
  await page.getByTestId("logo-board-light").screenshot({ path: `${shots}/logo-concepts-light.png` });
  await page.getByTestId("logo-board-dark").screenshot({ path: `${shots}/logo-concepts-dark.png` });
  const light = await page.getByTestId("logo-board-light-heart").locator("svg").first().innerHTML();
  const dark = await page.getByTestId("logo-board-dark-heart").locator("svg").first().innerHTML();
  expect(light).toContain("62D4C8");
  expect(dark).toContain("62D4C8");
  await expect(page.getByTestId("logo-board-light-spark")).toBeVisible();
  await expect(page.getByTestId("logo-board-dark-spark")).toBeVisible();
});
