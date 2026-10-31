import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const shots = "/opt/cursor/artifacts/screenshots/v8.1";

const headlines = {
  PT: "Monetize com a gente, do seu jeito",
  EN: "Monetize with us, your way",
  DE: "Monetarisiere mit uns, auf deine Art",
  FR: "Monétisez avec nous, à votre façon",
} as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/auth?route=sign-in");
  await page.evaluate(() => localStorage.clear());
});

test("dark login headline and badge use the Patrocino mark", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("mimelux-demo") || "{}");
    localStorage.setItem(
      "mimelux-demo",
      JSON.stringify({ ...current, cookieAccepted: true }),
    );
    localStorage.setItem("theme", "dark");
  });
  await page.reload();
  await expect(page.locator("aside h2")).toHaveText(headlines.PT);
  await expect(page.getByTestId("auth-mark").locator("svg")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("FanMimo");

  for (const [code, title] of Object.entries(headlines)) {
    await page.getByRole("main").getByRole("button", { name: code, exact: true }).click();
    const heading = page.locator("aside h2");
    await expect(heading).toHaveText(title);
    const color = await heading.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(246, 244, 255)");
  }

  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.reload();
  await expect(page.locator("aside h2")).toHaveText(headlines.FR);
  const light = await page.locator("aside h2").evaluate((el) => getComputedStyle(el).color);
  expect(light).toBe("rgb(24, 23, 37)");

  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.reload();
  await page.getByRole("main").getByRole("button", { name: "PT", exact: true }).click();
  await expect(page.locator("aside h2")).toHaveText(headlines.PT);
  await expect(page.getByRole("button", { name: "Entendi" })).toHaveCount(0);
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/login.png` });
});

test("star concepts stay labelled and the heart mark stays default", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await mkdir(shots, { recursive: true });
  await page.goto("/marca");
  for (const letter of ["A", "B", "C", "D", "E", "F"]) {
    await expect(page.getByTestId("logo-options-light").getByText(`${letter} ·`)).toBeVisible();
    await expect(page.getByTestId("logo-options-dark").getByText(`${letter} ·`)).toBeVisible();
  }
  await expect(page.getByTestId("logo-board-light").getByText("Centelha · padrão")).toBeVisible();
  await expect(page.getByTestId("logo-board-light").getByText("Apoio · alternativa")).toBeVisible();
  await page.getByTestId("logo-options-light").screenshot({ path: `${shots}/logo-options-light.png` });
  await page.getByTestId("logo-options-dark").screenshot({ path: `${shots}/logo-options-dark.png` });
});
