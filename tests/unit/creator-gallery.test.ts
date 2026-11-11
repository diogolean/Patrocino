import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { afterAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { loadCreatorGallery } from "../../apps/api/src/modules/creators/gallery";
import { postsTabSlots } from "../../packages/core/src/profile-gallery";
import { layoutGalleryRows } from "../../apps/web/lib/gallery";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe("paged creator gallery", () => {
  const ids = { userId: "", creatorId: "", draftUser: "", draftId: "" };

  afterAll(async () => {
    const creatorIds = [ids.creatorId, ids.draftId].filter(Boolean);
    const userIds = [ids.userId, ids.draftUser].filter(Boolean);
    if (creatorIds.length) {
      await database.media.deleteMany({ where: { post: { creatorId: { in: creatorIds } } } });
      await database.post.deleteMany({ where: { creatorId: { in: creatorIds } } });
      await database.creator.deleteMany({ where: { id: { in: creatorIds } } });
    }
    if (userIds.length) {
      await database.profile.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it("pages the full catalog, includes pay-per-view videos, and hides private files", async () => {
    const user = await database.user.create({
      data: {
        email: `gallery-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Galeria", username: `gallery${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle", defaultVideoPriceCents: 4900, defaultVideoPriceCentsUsd: 1900 } },
      },
      include: { creator: true },
    });
    ids.userId = user.id;
    ids.creatorId = user.creator!.id;
    const base = Date.now() - 86_400_000;
    for (let index = 0; index < 30; index += 1) {
      await database.post.create({
        data: {
          creatorId: ids.creatorId,
          caption: `Foto ${index}`,
          visibility: "SUBSCRIBERS",
          publishedAt: new Date(base + index * 1000),
          media: {
            create: {
              kind: "IMAGE",
              storageKey: `uploads/${ids.creatorId}/private/photo-${index}.jpg`,
              posterKey: `uploads/${ids.creatorId}/posters/photo-${index}.jpg`,
              mimeType: "image/jpeg",
              private: true,
            },
          },
        },
      });
    }
    for (let index = 0; index < 4; index += 1) {
      await database.post.create({
        data: {
          creatorId: ids.creatorId,
          caption: `clip-${index}.mp4`,
          visibility: "SUBSCRIBER_PPV",
          priceCents: 4900,
          priceCentsUsd: 1900,
          guestPriceCents: 5900,
          guestPriceCentsUsd: 2400,
          publishedAt: new Date(base + 50_000 + index * 1000),
          media: {
            create: {
              kind: "VIDEO",
              storageKey: `uploads/${ids.creatorId}/private/clip-${index}.mp4`,
              previewKey: `uploads/${ids.creatorId}/previews/clip-${index}.jpg`,
              posterKey: `uploads/${ids.creatorId}/private/posters/clip-${index}.jpg`,
              mimeType: "video/mp4",
              private: true,
            },
          },
        },
      });
    }
    const draft = await database.user.create({
      data: {
        email: `gallery-draft-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Rascunho", username: `draft${suffix}` } },
        creator: { create: { status: "DRAFT", category: "Lifestyle" } },
      },
      include: { creator: true },
    });
    ids.draftUser = draft.id;
    ids.draftId = draft.creator!.id;

    expect(await loadCreatorGallery({ key: `draft${suffix}`, tab: "posts", offset: 0, limit: 24, seed: "s", currency: "USD" })).toBeNull();
    const first = await loadCreatorGallery({ key: `gallery${suffix}`, tab: "posts", offset: 0, limit: 12, seed: "s", currency: "USD" });
    const second = await loadCreatorGallery({ key: `gallery${suffix}`, tab: "posts", offset: 12, limit: 12, seed: "s", currency: "USD" });
    expect(first?.photos).toBe(30);
    expect(first?.videos).toBe(4);
    expect(first?.items).toHaveLength(12);
    expect(first?.nextOffset).toBe(12);
    expect(second?.items).toHaveLength(12);
    expect(first?.items.some((item) => item.kind === "video")).toBe(true);
    const dumped = JSON.stringify([first, second]);
    expect(dumped).not.toContain("/private/");
    expect(dumped).not.toContain("clip-0.mp4");
    expect(dumped).toContain("Vídeo exclusivo #");
    const videos = await loadCreatorGallery({ key: `gallery${suffix}`, tab: "videos", offset: 0, limit: 24, seed: "s", currency: "BRL" });
    expect(videos?.items).toHaveLength(4);
    expect(videos?.items.every((item) => item.kind === "video" && item.video.posterUrl == null && item.video.purchased === false)).toBe(true);
    const guest = videos?.items.find((item) => item.kind === "video");
    expect(guest && guest.kind === "video" ? guest.video.priceCents : 0).toBe(5900);

    const slots = postsTabSlots(30, 4, "s");
    const rows = layoutGalleryRows(
      Array.from({ length: 30 }, (_, index) => ({ kind: "photo" as const, index })),
      Array.from({ length: 4 }, (_, index) => ({ kind: "video" as const, index })),
      "s",
    );
    expect(slots).toEqual(rows);
    const idsOnPage = new Set([
      ...(first?.items ?? []).map((item) => (item.kind === "post" ? item.post.id : item.video.id)),
      ...(second?.items ?? []).map((item) => (item.kind === "post" ? item.post.id : item.video.id)),
    ]);
    expect(idsOnPage.size).toBe(24);
  });
});
