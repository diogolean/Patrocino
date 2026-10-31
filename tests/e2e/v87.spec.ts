import { expect, test } from "@playwright/test";

test("sign-in starts blank and each role still opens after the credentials are typed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/auth?route=sign-in");
  await expect(page.getByLabel("Email ou CPF")).toHaveValue("");
  await expect(page.locator('input[name="password"]')).toHaveValue("");

  await page.getByLabel("Email ou CPF").fill("pessoa.real@mimelux.test");
  await page.getByRole("switch", { name: "Criador ou afiliado" }).click();
  await expect(page.getByLabel("Email ou CPF")).toHaveValue("pessoa.real@mimelux.test");
  await expect(page.locator('input[name="password"]')).toHaveValue("");

  await page.goto("/auth?route=sign-in");
  await page.getByRole("switch", { name: "Criador ou afiliado" }).click();
  await page.getByRole("button", { name: "Afiliado", exact: true }).click();
  await expect(page.getByLabel("Email ou CPF")).toHaveValue("");
  await expect(page.locator('input[name="password"]')).toHaveValue("");
  await page.getByLabel("Email ou CPF").fill("afiliado@patrocino.com");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/afiliados/);
  await expect(page.getByTestId("session-user")).toHaveAttribute("data-role", "affiliate");
  await expect(page.getByTestId("session-user")).toHaveAttribute("data-email", "afiliado@mimelux.com.br");

  await page.goto("/auth?route=sign-in");
  await page.getByRole("switch", { name: "Criador ou afiliado" }).click();
  await page.getByRole("button", { name: "Criador", exact: true }).click();
  await expect(page.getByLabel("Email ou CPF")).toHaveValue("");
  await page.getByLabel("Email ou CPF").fill("criadora@patrocino.com");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.getByTestId("session-user")).toHaveAttribute("data-role", "creator");

  await page.goto("/auth?route=sign-in");
  await expect(page.getByLabel("Email ou CPF")).toHaveValue("");
  await page.getByLabel("Email ou CPF").fill("fan@patrocino.com");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/topcreators/);
  await expect(page.getByTestId("session-user")).toHaveAttribute("data-role", "fan");
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: "Seu feed" })).toBeVisible();
  await expect(page.getByTestId("session-user")).toHaveAttribute("data-role", "fan");
  await expect(page.getByTestId("session-user")).toHaveAttribute("data-email", "fan@mimelux.com.br");
});

test("a referral code without a creator opens that affiliate default page", async ({ page }) => {
  await page.goto("/r/nara?sub=qa-home");
  await expect(page).toHaveURL(/\/r\/nara\/albina-schneider\?sub=qa-home/);
  await expect(page.getByRole("heading", { name: "Albina Schneider" })).toBeVisible();
});
