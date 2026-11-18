import { expect, test } from "@playwright/test";

test("creator and link-in-bio share images respond with an image", async ({ request }) => {
  for (const path of ["/creator/luna-ferraz/opengraph-image", "/l/luna-ferraz/opengraph-image"]) {
    const response = await request.get(path, { headers: { "user-agent": "facebookexternalhit/1.1" } });
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toMatch(/^image\/(png|jpeg|webp)/);
    expect((await response.body()).byteLength).toBeGreaterThan(32);
  }
});

test("checkout HTML includes the creator, avatar, and price before hydration", async ({ request }) => {
  const response = await request.get("/checkout?kind=subscription&id=luna-ferraz");
  expect(response.status()).toBe(200);
  const html = await response.text();
  const visible = html.split('hidden id="S:0"')[0] ?? html;
  expect(visible).toContain("Assinatura de Luna Ferraz");
  expect(visible).toContain('alt="Luna Ferraz"');
  expect(visible).toContain('data-testid="checkout-amount"');
  expect(visible).not.toContain("h-[75vh] rounded-[34px] skeleton");
  expect(html).toContain('property="og:image" content="https://patrocino.com/creator/luna-ferraz/opengraph-image"');
  expect(html).toContain("Luna Ferraz | Patrocino");
});

test("link-in-bio buttons keep ref and utm from the URL", async ({ request }) => {
  const response = await request.get("/l/luna-ferraz?ref=4embsj&sub=story&utm_source=ig&utm_campaign=launch");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("ref=4embsj");
  expect(html).toContain("utm_source=ig");
  expect(html).toContain("utm_campaign=launch");
  expect(html).toContain("sub=story");
  expect(html).toContain("/checkout?");
});
