import { expect, test, type Page } from "@playwright/test";

const ageCookie = {
  name: "patrocino_age",
  value: "yes",
  domain: "127.0.0.1",
  path: "/",
  expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  httpOnly: false,
  secure: false,
  sameSite: "Lax" as const,
};

async function installCheckout(page: Page, currency: "BRL" | "USD") {
  let signedIn = false;
  const cents = currency === "USD" ? 2400 : 5900;
  await page.route("**/api/payments/provider", async (route) => {
    await route.fulfill({ json: { expay: true, stripe: true, stripePublishableKey: "pk_test_guest" } });
  });
  await page.route("**/api/payments/quote", async (route) => {
    await route.fulfill({
      json: {
        amountCents: cents,
        currency,
        subscriberCents: currency === "USD" ? 1900 : 4900,
        guestCents: cents,
        subscribed: false,
        authenticated: signedIn,
        description: "Vídeo exclusivo",
        creatorId: "sophie-bennet",
        subjectId: "video-1",
        purpose: "post",
      },
    });
  });
  await page.route("**/api/creators/sophie-bennet", async (route) => {
    await route.fulfill({
      json: {
        id: "sophie-bennet",
        name: "Sophie Bennet",
        username: "sophie-bennet",
        plans: [],
        packs: [],
        posts: [],
        currency,
      },
    });
  });
  await page.route("**/api/session/register", async (route) => {
    signedIn = true;
    await route.fulfill({
      json: {
        user: {
          id: "fan-guest",
          email: "guest@example.com",
          role: "fan",
          emailVerified: false,
          name: "Guest Fan",
          username: "guestfan",
          avatarUrl: null,
        },
      },
    });
  });
  await page.route("**/api/payments/expay/charges**", async (route) => {
    await route.fulfill({
      json: {
        chargeId: "ch_guest",
        status: "pending",
        accessActive: false,
        billingMode: "one_off",
        copiaECola: "00020126580014br.gov.bcb.pix",
        qrCode: null,
        amountCents: 5900,
        eventId: "evt_guest",
        currency: "BRL",
      },
    });
  });
  await page.route("**/api/payments/checkout", async (route) => {
    await route.fulfill({
      json: { clientSecret: "pi_secret_test", amountCents: cents, currency, eventId: "evt_card" },
    });
  });
}

async function openGuestVideo(page: Page) {
  await page.goto("/checkout?kind=post&id=video-1&creator=sophie-bennet");
  await page.getByRole("button", { name: /Aceitar todos|Accept all/ }).click().catch(() => undefined);
}

async function createGuestAccount(page: Page, copy: { name: string; email: string; password: string; continueLabel: string }) {
  await page.getByLabel(copy.name).fill("Guest Fan");
  await page.getByLabel(copy.email).fill("guest@example.com");
  await page.getByLabel(copy.password).fill("secret1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: copy.continueLabel }).click();
}

test.describe("guest video checkout", () => {
  test.describe.configure({ mode: "serial" });

  test("a pt-BR guest sees R$ 59,00 and reaches Pix", async ({ page }) => {
    test.setTimeout(60_000);
    await installCheckout(page, "BRL");
    await openGuestVideo(page);
    await expect(page.getByTestId("checkout-amount")).toHaveText(/R\$\s*59,00/);
    await expect(page.getByTestId("guest-checkout")).toBeVisible();
    await expect(page.getByText("Entre na sua conta para pagar.")).toHaveCount(0);
    await createGuestAccount(page, { name: "Nome", email: "E-mail", password: "Senha", continueLabel: "Continuar para o pagamento" });
    await page.getByRole("button", { name: "Pagar com Pix" }).click();
    await expect(page.getByTestId("expay-checkout")).toBeVisible();
    await expect(page.getByTestId("expay-amount")).toHaveText(/R\$\s*59,00/);
  });

  test("an en-US guest sees $24.00 and reaches card payment", async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext({ locale: "en-US", storageState: { cookies: [ageCookie], origins: [] } });
    const page = await context.newPage();
    try {
      await installCheckout(page, "USD");
      await openGuestVideo(page);
      await expect(page.getByTestId("checkout-amount")).toHaveText(/\$24\.00/);
      await expect(page.getByTestId("guest-checkout")).toBeVisible();
      await createGuestAccount(page, { name: "Name", email: "Email", password: "Password", continueLabel: "Continue to payment" });
      await page.getByRole("button", { name: "Card" }).click();
      await expect(page.getByTestId("stripe-checkout")).toBeVisible();
      await expect(page.getByTestId("stripe-amount")).toHaveText(/\$24\.00/);
    } finally {
      await context.close();
    }
  });
});
