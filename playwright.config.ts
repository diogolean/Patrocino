import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/visitor-currency.spec.ts"],
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3333",
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: {
      cookies: [
        {
          name: "patrocino_age",
          value: "yes",
          domain: "127.0.0.1",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  },
  webServer: {
    command: "pnpm dev:web",
    url: "http://127.0.0.1:3333/auth?route=sign-in",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
