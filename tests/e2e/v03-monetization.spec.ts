import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/auth?route=sign-in");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Email ou CPF").fill("fan@mimelux.com.br");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/topcreators/);
});

test("promotion price is visible and PPV unlock persists", async ({ page }) => {
  await page.goto("/creator/lunaferraz");
  const banner = page.getByTestId("promotion-banner");
  if (await banner.count()) {
    await expect(banner).toContainText("50% OFF");
  } else {
    await expect(page.getByTestId("plan-price").first()).toBeVisible();
  }

  const paidPost = page.locator('[data-testid="profile-post"]').filter({
    has: page.locator('a[href*="kind=post"]'),
  }).first();
  await expect(paidPost).toHaveAttribute("data-locked", "true");
  await paidPost.getByText("Desbloquear conteúdo").click();
  await page.getByRole("button", { name: "Simular pagamento" }).click();
  await expect(page.getByText("Conteúdo liberado")).toBeVisible();
  await page.getByRole("button", { name: /Ver agora/ }).click();
  await expect(page.locator('[data-testid="profile-post"][data-locked="false"]')).toHaveCount(7);
  await page.reload();
  await expect(page.locator('[data-testid="profile-post"][data-locked="false"]')).toHaveCount(7);
});

test("special request follows request, quote, pay and delivery states", async ({
  page,
}) => {
  await page.goto("/creator/lunaferraz");
  await page.getByRole("button", { name: "Pedido especial" }).click();
  await page.getByLabel("Descrição").fill(
    "Gostaria de um vídeo fictício com uma rotina de café.",
  );
  await page.getByLabel("Orçamento opcional").fill("120");
  await page.getByRole("button", { name: "Enviar pedido demo" }).click();

  await page.goto("/auth?route=sign-in");
  await page.getByLabel("Email ou CPF").fill("criadora@mimelux.com.br");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel/);
  await page
    .getByTestId("special-request-card")
    .getByRole("button", { name: "Contrapropor R$ 150" })
    .click();

  await page.goto("/auth?route=sign-in");
  await page.getByLabel("Email ou CPF").fill("fan@mimelux.com.br");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/topcreators/);
  await page.goto("/creator/lunaferraz");
  await page
    .getByRole("button", { name: "Aceitar e simular pagamento" })
    .click();
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByRole("button", { name: "Simular pagamento" }).click();
  await expect(page.getByText("Pedido confirmado")).toBeVisible();

  await page.goto("/auth?route=sign-in");
  await page.getByLabel("Email ou CPF").fill("criadora@mimelux.com.br");
  await page.locator('input[name="password"]').fill("mimelux123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel/);
  await page.getByRole("button", { name: "Marcar como entregue" }).click();
  await expect(page.getByTestId("special-request-card")).toContainText("Entregue");
});

test("admin mode switch isolates demo fixtures", async ({ page }) => {
  await page.getByTestId("mode-toggle").click();
  await expect(page.getByRole("heading", { name: "Pronto para conteúdo real" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pronto para conteúdo real" })).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao modo demo" }).click();
  await expect(page.getByText("Patrocino", { exact: true }).first()).toBeVisible();
});

test("an attributed PPV purchase creates an affiliate commission", async ({
  page,
}) => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("mimelux-demo") || "{}");
    const attribution = {
      id: "att-ppv-test",
      code: "LUXDEMO",
      creatorId: "luna-ferraz",
      creatorSlug: "lunaferraz",
      subId: "ppv-campaign",
      clickId: "click-ppv-test",
      clickedAt: new Date().toISOString(),
      fanEmail: "fan@mimelux.com.br",
    };
    localStorage.setItem(
      "mimelux-demo",
      JSON.stringify({ ...state, activeAttribution: attribution }),
    );
  });
  await page.goto("/creator/lunaferraz");
  const paidPost = page.locator('[data-testid="profile-post"]').filter({
    has: page.locator('a[href*="kind=post"]'),
  }).first();
  await paidPost.getByText("Desbloquear conteúdo").click();
  await page.getByRole("button", { name: "Simular pagamento" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("mimelux-demo") || "{}");
        return state.commissions?.some(
          (commission: { transactionKind?: string; subId: string }) =>
            commission.transactionKind === "ppv" &&
            commission.subId === "ppv-campaign",
        );
      }),
    )
    .toBe(true);
});
