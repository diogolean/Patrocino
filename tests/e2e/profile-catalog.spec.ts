import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";
import { database } from "../../packages/db/src/index";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const username = `page${suffix}`;
const draftName = `draft${suffix}`;
let api: ChildProcess | null = null;
let ownsApi = false;
let creatorId = "";
let draftId = "";
let userId = "";
let draftUserId = "";

test.beforeAll(async () => {
  const user = await database.user.create({
    data: {
      email: `page-${suffix}@patrocino.test`,
      passwordHash: "test-only",
      role: "CREATOR",
      profile: { create: { name: "Page Creator", username } },
      creator: { create: { status: "ACTIVE", category: "Lifestyle", defaultVideoPriceCents: 4900, defaultVideoPriceCentsUsd: 1900, guestVideoPriceCents: 5900, guestVideoPriceCentsUsd: 2400 } },
    },
    include: { creator: true },
  });
  userId = user.id;
  creatorId = user.creator!.id;
  const base = Date.now() - 86_400_000;
  for (let index = 0; index < 30; index += 1) {
    await database.post.create({
      data: {
        creatorId,
        caption: `Foto ${index}`,
        visibility: "SUBSCRIBERS",
        publishedAt: new Date(base + index * 1000),
        media: { create: { kind: "IMAGE", storageKey: `uploads/${creatorId}/private/p${index}.jpg`, posterKey: `uploads/${creatorId}/posters/p${index}.jpg`, mimeType: "image/jpeg", private: true } },
      },
    });
  }
  for (let index = 0; index < 4; index += 1) {
    await database.post.create({
      data: {
        creatorId,
        caption: `clip-${index}.mp4`,
        visibility: "SUBSCRIBER_PPV",
        priceCents: 4900,
        priceCentsUsd: 1900,
        guestPriceCents: 5900,
        guestPriceCentsUsd: 2400,
        publishedAt: new Date(base + 40_000 + index * 1000),
        media: {
          create: {
            kind: "VIDEO",
            storageKey: `uploads/${creatorId}/private/c${index}.mp4`,
            previewKey: `uploads/${creatorId}/previews/c${index}.jpg`,
            posterKey: `uploads/${creatorId}/private/posters/c${index}.jpg`,
            mimeType: "video/mp4",
            private: true,
          },
        },
      },
    });
  }
  const draft = await database.user.create({
    data: {
      email: `page-draft-${suffix}@patrocino.test`,
      passwordHash: "test-only",
      role: "CREATOR",
      profile: { create: { name: "Rascunho", username: draftName } },
      creator: { create: { status: "DRAFT", category: "Lifestyle" } },
    },
    include: { creator: true },
  });
  draftUserId = draft.id;
  draftId = draft.creator!.id;
  let alreadyUp = false;
  try {
    alreadyUp = (await fetch("http://127.0.0.1:3334/v1/health")).ok;
  } catch {
    alreadyUp = false;
  }
  if (!alreadyUp) {
    ownsApi = true;
    api = spawn("node", ["apps/api/dist/main.js"], {
      env: { ...process.env, PORT: "3334", DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://mimelux:mimelux_dev@localhost:5432/mimelux?schema=public" },
      stdio: "ignore",
    });
  }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3334/v1/health");
      if (response.ok) return;
    } catch {
      // The process is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("API did not start");
});

test.afterAll(async () => {
  if (ownsApi) api?.kill();
  const creatorIds = [creatorId, draftId].filter(Boolean);
  const userIds = [userId, draftUserId].filter(Boolean);
  if (creatorIds.length) {
    await database.media.deleteMany({ where: { post: { creatorId: { in: creatorIds } } } });
    await database.post.deleteMany({ where: { creatorId: { in: creatorIds } } });
    await database.creator.deleteMany({ where: { id: { in: creatorIds } } });
  }
  if (userIds.length) {
    await database.profile.deleteMany({ where: { userId: { in: userIds } } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await database.$disconnect();
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mimelux-demo", JSON.stringify({ coachSeen: true }));
  });
});

test("a fixture creator resolves at /username", async ({ page }) => {
  await page.goto("/lunaferraz");
  await page.getByRole("button", { name: "Aceitar todos" }).click().catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Luna Ferraz" })).toBeVisible();
});

test("an unknown bare username and a draft creator stay 404", async ({ page }) => {
  expect((await page.goto("/nobody-home-zz"))?.status()).toBe(404);
  expect((await page.goto(`/${draftName}`))?.status()).toBe(404);
});

test("an active database creator pages the full catalog at /username", async ({ page }) => {
  const response = await page.goto(`/${username}`);
  expect(response?.status()).toBe(200);
  await page.getByRole("button", { name: "Aceitar todos" }).click().catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Page Creator" })).toBeVisible();
  await expect(page.getByTestId("profile-photo-count")).toHaveText("30");
  await expect(page.getByTestId("profile-video-count")).toHaveText("4");
  await expect(page.getByTestId("gallery-ppv").first()).toBeVisible();
  const before = await page.getByTestId("profile-post").count();
  const more = page.waitForResponse((response) => response.url().includes("/gallery") && response.ok());
  await page.getByTestId("gallery-more").click();
  await more;
  await expect.poll(async () => page.getByTestId("profile-post").count(), { timeout: 15_000 }).toBeGreaterThan(before);
});
