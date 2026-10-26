import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/auth?route=sign-in");
  await page.getByLabel("Email ou CPF").fill(email);
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("an admin updates another creator plan and checkout shows the new price", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signIn(page, "admin@patrocino.com");
  await expect(page).toHaveURL(/\/admin/);

  await page.getByTestId("admin-studio-search").fill("Luna");
  const creator = page.getByTestId("admin-studio-creator");
  await expect(creator.locator("option", { hasText: "Luna Ferraz" })).toHaveCount(1);
  await creator.selectOption({ label: /Luna Ferraz/ });

  const monthly = page.locator('[data-testid="creator-plan"][data-months="1"]');
  await expect(monthly).toBeVisible();
  const price = monthly.getByTestId("plan-price-1");
  const original = await price.inputValue();
  await price.fill("43.21");
  await monthly.getByTestId("plan-save-1").click();
  await expect(page.getByTestId("studio-notice")).toHaveText("Plano atualizado.");

  await page.goto("/checkout?kind=subscription&id=luna-ferraz&plan=monthly");
  await expect(page.getByTestId("checkout-amount")).toContainText("43,21");
  await expect(page.getByTestId("checkout-plan")).toHaveText("Mensal");
  await expect(page.getByText("Este é um ambiente de demonstração")).toHaveCount(0);
  await expect(page.getByText("renovação simulada")).toHaveCount(0);
  await expect(page.getByText("O cartão é confirmado pela Stripe")).toHaveCount(0);
  await expect(page.getByText("O Pix abre o código na hora.")).toBeVisible();

  await page.goto("/admin");
  await page.getByTestId("admin-studio-search").fill("Luna");
  await expect(page.getByTestId("admin-studio-creator").locator("option", { hasText: "Luna Ferraz" })).toHaveCount(1);
  await page.getByTestId("admin-studio-creator").selectOption({ label: /Luna Ferraz/ });
  const restore = page.locator('[data-testid="creator-plan"][data-months="1"]');
  await restore.getByTestId("plan-price-1").fill(original);
  await restore.getByTestId("plan-save-1").click();
  await expect(page.getByTestId("studio-notice")).toHaveText("Plano atualizado.");
});

test("a creator cannot update another creator plan", async ({ page }) => {
  await signIn(page, "admin@patrocino.com");
  await expect(page).toHaveURL(/\/admin/);
  const listed = await page.request.get("/api/admin/creators?q=Luna");
  expect(listed.ok()).toBeTruthy();
  const creators = (await listed.json()) as { creators: Array<{ id: string; name: string }> };
  const luna = creators.creators.find((creator) => creator.name === "Luna Ferraz");
  expect(luna).toBeTruthy();
  const studio = await page.request.get(`/api/creators/${luna!.id}/plans`);
  expect(studio.ok()).toBeTruthy();
  const plans = (await studio.json()) as { plans: Array<{ id: string; durationMonths: number; priceCents: number }> };
  const monthly = plans.plans.find((plan) => plan.durationMonths === 1);
  expect(monthly).toBeTruthy();

  await signIn(page, "bellamonroe@creators.patrocino.com");
  await expect(page).toHaveURL(/\/painel/);
  const denied = await page.request.patch(`/api/creators/${luna!.id}/plans/${monthly!.id}`, {
    data: { priceCents: monthly!.priceCents + 100 },
  });
  expect(denied.status()).toBe(403);
});
