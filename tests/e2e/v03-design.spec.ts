import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const artifactDir = "/opt/cursor/artifacts/screenshots";

test.beforeEach(async ({ page }) => {
  await page.goto("/auth?route=sign-in");
  await page.evaluate(() => {
    localStorage.clear();
    document.cookie = "mimelux-locale=pt-BR;path=/";
  });
  await page.reload();
});

async function loginAs(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.getByLabel("Email ou CPF").fill(email);
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("each demo account reaches and is guarded to its own home", async ({ page }) => {
  await loginAs(page, "fan@mimelux.com.br");
  await expect(page).toHaveURL(/\/topcreators/);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/topcreators/);

  await page.goto("/auth?route=sign-in");
  await loginAs(page, "criadora@mimelux.com.br");
  await expect(page).toHaveURL(/\/painel$/);
  await page.goto("/afiliados");
  await expect(page).toHaveURL(/\/painel$/);

  await page.goto("/auth?route=sign-in");
  await loginAs(page, "afiliado@mimelux.com.br");
  await expect(page).toHaveURL(/\/afiliados$/);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/afiliados$/);
});

test("social signup keeps the selected affiliate role", async ({ page }) => {
  await page.goto("/auth?route=sign-up");
  await page.getByRole("switch", { name: "Criador ou afiliado" }).click();
  await page.getByRole("button", { name: "Afiliado", exact: true }).click();
  await page.getByTestId("accept-terms").check();
  await page.getByRole("button", { name: "Entrar com Google" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: /Pular tutorial/ }).click();
  await expect(page).toHaveURL(/\/afiliados$/);
});

test("theme follows the toggle across public and app pages", async ({ page }) => {
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await loginAs(page, "fan@mimelux.com.br");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("featured section renders and carousel advances", async ({ page }) => {
  const section = page.getByTestId("monetize-section");
  await section.scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", { name: "Transforme atenção em renda." }),
  ).toBeVisible();
  const first = page.getByRole("button", { name: "Mostrar Albina Schneider" });
  const second = page.getByRole("button", { name: "Mostrar Amanda Ribeiro" });
  await expect(first).toHaveClass(/w-8/);
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(second).toHaveClass(/w-8/);
});

test("desktop sidebar collapses manually and when content scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, "fan@mimelux.com.br");
  const sidebar = page.locator("aside[data-collapsed]");
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  await page.getByRole("button", { name: "Recolher menu lateral" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await page.getByRole("button", { name: "Expandir menu lateral" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: "instant" }));
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("mimelux-sidebar-collapsed")))
    .toBe("true");
});

test("captures V0.3 light and dark theme evidence", async ({ page }) => {
  await mkdir(artifactDir, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth?route=sign-in");
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: `${artifactDir}/mimelux-v03-login-dark-mobile-390.png`,
    fullPage: true,
  });

  await page.evaluate(() => {
    localStorage.setItem("theme", "light");
    const state = JSON.parse(localStorage.getItem("mimelux-demo") || "{}");
    localStorage.setItem(
      "mimelux-demo",
      JSON.stringify({ ...state, signedIn: true, role: "fan" }),
    );
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/creator/lunaferraz");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.screenshot({
    path: `${artifactDir}/mimelux-v03-profile-light-desktop-1440.png`,
    fullPage: true,
  });
});
