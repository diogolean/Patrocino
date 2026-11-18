import { expect, test } from "@playwright/test";

test("demo video posts render a 3:4 player and keep locked clips behind the poster", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/creator/bellamonroe");
  const freeVideo = page.getByTestId("profile-video");
  await expect(freeVideo).toHaveCount(1);
  await expect(freeVideo).toHaveAttribute("src", "/media/models/demo/bella-monroe/v001.mp4?v=2");
  await expect(freeVideo).toHaveAttribute("poster", "/media/models/demo/bella-monroe/v001.jpg?v=2");
  await expect(freeVideo).toHaveJSProperty("muted", true);
  await expect(freeVideo).toHaveJSProperty("loop", true);
  await expect(freeVideo).toHaveJSProperty("autoplay", true);
  await expect(freeVideo).toHaveJSProperty("controls", true);
  await expect(freeVideo).toHaveJSProperty("playsInline", true);
  await expect(freeVideo.locator("xpath=..")).toHaveClass(/aspect-\[3\/4\]/);
  const frame = await freeVideo.boundingBox();
  expect(frame).toBeTruthy();
  expect(frame!.height / frame!.width).toBeGreaterThan(1.2);
  expect(frame!.height / frame!.width).toBeLessThan(1.45);

  await page.goto("/creator/lunaferraz");
  const locked = page.locator('[data-testid="profile-post"][data-locked="true"]').filter({
    has: page.locator('img[src*="luna-ferraz/v001.jpg"]'),
  });
  await expect(locked).toHaveCount(1);
  await expect(locked.locator("video")).toHaveCount(0);
  await expect(locked.locator("img")).toHaveAttribute("src", "/media/models/demo/luna-ferraz/v001.jpg?v=2");
  await expect(locked.locator("img")).not.toHaveClass(/blur-/);
  await expect(locked).toHaveClass(/aspect-\[3\/4\]/);

  await page.getByRole("link", { name: /1 mês/ }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByRole("button", { name: "Simular pagamento" }).click();
  await expect(page.getByText("Você faz parte!")).toBeVisible();
  await page.getByRole("button", { name: /Ver agora/ }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/creator/lunaferraz");
  const unlocked = page.getByTestId("profile-video");
  await expect(unlocked).toHaveCount(1);
  await expect(unlocked).toHaveAttribute("src", "/api/media/file/demo-media-luna-ferraz-v001");
  await expect(unlocked).toHaveAttribute("poster", "/media/models/demo/luna-ferraz/v001.jpg?v=2");
  await expect(unlocked).toHaveJSProperty("muted", true);
  await expect(unlocked).toHaveJSProperty("playsInline", true);
  await expect(unlocked.locator("xpath=..")).toHaveClass(/aspect-\[3\/4\]/);

  await page.goto("/feed");
  const freeFeed = page.locator('video[src="/media/models/demo/bella-monroe/v001.mp4?v=2"]');
  await expect(freeFeed).toHaveCount(1);
  const feedHtml = await page.content();
  expect(feedHtml).not.toContain("clara-duarte/v001");
  expect(feedHtml).not.toContain("nina-valenca/v001");
  expect(feedHtml).not.toContain("demo-media-nina-valenca-v001");
  const lockedCover = page.locator("article").filter({ hasText: "Clara Duarte" }).locator("[data-testid=locked-cover]").first();
  await expect(lockedCover).toHaveAttribute("src", /creator-clara-duarte-cover/);
  await expect(lockedCover).not.toHaveClass(/blur-/);
  const feed = await freeFeed.evaluate((video) => {
    if (!(video instanceof HTMLVideoElement)) return null;
    video.scrollIntoView({ block: "center" });
    const rect = video.getBoundingClientRect();
    return {
      poster: video.getAttribute("poster"),
      controls: video.controls,
      playsInline: video.playsInline,
      muted: video.muted,
      parentClass: video.parentElement?.className ?? "",
      width: rect.width,
      height: rect.height,
    };
  });
  expect(feed).toMatchObject({
    poster: "/media/models/demo/bella-monroe/v001.jpg?v=2",
    controls: true,
    playsInline: true,
    muted: true,
  });
  expect(feed?.parentClass).toContain("aspect-[3/4]");
  expect(feed!.width).toBeLessThan(420);
  expect(feed!.height / feed!.width).toBeGreaterThan(1.2);
  expect(feed!.height / feed!.width).toBeLessThan(1.45);
});
