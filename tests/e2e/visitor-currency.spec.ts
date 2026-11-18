import { spawn, type ChildProcess } from "node:child_process";
import { expect, test, type APIRequestContext } from "@playwright/test";

const webPort = 3391;
const apiPort = 3394;
const baseURL = `http://127.0.0.1:${webPort}`;

let stub: ChildProcess | null = null;
let web: ChildProcess | null = null;

async function waitFor(url: string) {
  const deadline = Date.now() + 90_000;
  let last = "not started";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return;
      last = `status ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : "unreachable";
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`server did not start (${url}): ${last}`);
}

function stop(child: ChildProcess | null) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
}

test.beforeAll(async () => {
  stub = spawn("pnpm", ["exec", "tsx", "tests/e2e/visitor-currency-stub.ts"], {
    env: { ...process.env, PORT: String(apiPort) },
    stdio: "ignore",
  });
  await waitFor(`http://127.0.0.1:${apiPort}/v1/health`);
  web = spawn("pnpm", ["--filter", "@mimelux/web", "exec", "next", "start", "--hostname", "127.0.0.1", "--port", String(webPort)], {
    env: {
      ...process.env,
      API_URL: `http://127.0.0.1:${apiPort}/v1`,
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}/v1`,
    },
    stdio: "ignore",
  });
  await waitFor(`${baseURL}/auth?route=sign-in`);
});

test.afterAll(() => {
  stop(web);
  stop(stub);
});

async function page(request: APIRequestContext, path: string, acceptLanguage: string) {
  const response = await request.get(path, { headers: { "accept-language": acceptLanguage } });
  expect(response.status(), path).toBe(200);
  const cache = response.headers()["cache-control"] ?? "";
  expect(cache, path).toContain("private");
  expect(cache, path).toContain("no-store");
  expect(response.headers()["cdn-cache-control"] ?? "", path).toContain("no-store");
  const vary = (response.headers()["vary"] ?? "").toLowerCase();
  expect(vary, path).toContain("accept-language");
  expect(vary, path).toContain("cookie");
  return response.text();
}

test.describe("visitor currency from Accept-Language", () => {
  test.describe.configure({ mode: "serial" });

  test("en-US with no country header shows USD on the profile and checkout", async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL });
    try {
      const profile = await page(request, "/creator/sophie-bennet", "en-US,en;q=0.9");
      const checkout = await page(request, "/checkout?kind=subscription&id=sophie-bennet", "en-US,en;q=0.9");
      expect(profile).toMatch(/<html[^>]*lang="en"/);
      expect(checkout).toMatch(/<html[^>]*lang="en"/);
      expect(profile).toContain("$8.00");
      expect(checkout).toContain("$8.00");
      expect(profile).not.toContain("39,00");
      expect(checkout).not.toContain("39,00");
    } finally {
      await request.dispose();
    }
  });

  test("pt-BR with no country header shows BRL on the profile and checkout", async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL });
    try {
      const profile = await page(request, "/creator/sophie-bennet", "pt-BR,pt;q=0.9");
      const checkout = await page(request, "/checkout?kind=subscription&id=sophie-bennet", "pt-BR,pt;q=0.9");
      expect(profile).toMatch(/<html[^>]*lang="pt-BR"/);
      expect(checkout).toMatch(/<html[^>]*lang="pt-BR"/);
      expect(profile).toContain("39,00");
      expect(checkout).toContain("39,00");
      expect(profile).not.toContain("$8.00");
      expect(checkout).not.toContain("$8.00");
    } finally {
      await request.dispose();
    }
  });
});
