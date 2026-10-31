import { afterAll, describe, expect, it } from "vitest";
import { catalogDefaults, sarahMitchellPlanId } from "../../packages/core/src/currency";
import { database } from "../../packages/db/src/index";
import { applyDefaultPrices } from "../../scripts/apply-default-prices";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe("default catalog prices", () => {
  const created: string[] = [];
  let restore: { entity: "plan" | "post" | "creator"; id: string; field: string; from: number | null }[] = [];

  afterAll(async () => {
    for (const change of restore) {
      const data = { [change.field]: change.from };
      if (change.entity === "plan") await database.plan.updateMany({ where: { id: change.id }, data });
      if (change.entity === "post") await database.post.updateMany({ where: { id: change.id }, data });
      if (change.entity === "creator") await database.creator.updateMany({ where: { id: change.id }, data });
    }
    if (created.length) {
      await database.plan.deleteMany({ where: { creatorId: { in: created } } });
      await database.post.deleteMany({ where: { creatorId: { in: created } } });
      await database.creator.deleteMany({ where: { id: { in: created } } });
      await database.user.deleteMany({ where: { email: { in: [`prices-${suffix}@patrocino.test`, `sarah-prices-${suffix}@patrocino.test`] } } });
    }
    await database.$disconnect();
  });

  it("lists changes on dry-run, applies them once, and leaves Sarah Mitchell untouched", async () => {
    const other = await database.user.create({
      data: {
        email: `prices-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Outra Criadora", username: `prices${suffix}` } },
        creator: {
          create: {
            status: "ACTIVE",
            category: "Lifestyle",
            defaultVideoPriceCents: 100,
            defaultVideoPriceCentsUsd: 100,
            plans: {
              create: [
                { name: "Mensal", description: "m", priceCents: 1000, priceCentsUsd: 100, durationMonths: 1, discountPercent: 0 },
                { name: "3 meses", description: "q", priceCents: 3000, priceCentsUsd: 300, durationMonths: 3, discountPercent: 0 },
              ],
            },
            posts: {
              create: { caption: "Video", visibility: "PPV", priceCents: 100, priceCentsUsd: 100, publishedAt: new Date() },
            },
          },
        },
      },
      include: { creator: true },
    });
    const sarah = await database.user.create({
      data: {
        email: `sarah-prices-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Sarah Mitchell", username: `sarah-mitchell-${suffix}` } },
        creator: {
          create: {
            status: "ACTIVE",
            category: "Lifestyle",
            defaultVideoPriceCents: 100,
            defaultVideoPriceCentsUsd: 100,
            plans: {
              create: {
                id: `${sarahMitchellPlanId}-${suffix}`,
                name: "Mensal",
                description: "teste",
                priceCents: 100,
                priceCentsUsd: 100,
                durationMonths: 1,
                discountPercent: 0,
              },
            },
            posts: {
              create: { caption: "Sarah video", visibility: "PPV", priceCents: 100, priceCentsUsd: 100, publishedAt: new Date() },
            },
          },
        },
      },
      include: { creator: { include: { plans: true, posts: true } } },
    });
    created.push(other.creator!.id, sarah.creator!.id);

    const only = { dryRun: true, creatorIds: [other.creator!.id, sarah.creator!.id] };
    const preview = await applyDefaultPrices(database, only);
    restore = preview.changes;
    const touched = preview.changes.filter((change) => change.creatorId === other.creator!.id);
    const sarahChanges = preview.changes.filter((change) => change.creatorId === sarah.creator!.id);
    expect(sarahChanges).toEqual([]);
    expect(touched.some((change) => change.field === "priceCents" && change.to === catalogDefaults.monthlyBrlCents)).toBe(true);
    expect(touched.some((change) => change.field === "priceCentsUsd" && change.to === catalogDefaults.videoUsdCents)).toBe(true);

    await applyDefaultPrices(database, { dryRun: false, creatorIds: [other.creator!.id, sarah.creator!.id] });
    const monthly = await database.plan.findFirst({ where: { creatorId: other.creator!.id, durationMonths: 1 } });
    const quarter = await database.plan.findFirst({ where: { creatorId: other.creator!.id, durationMonths: 3 } });
    const video = await database.post.findFirst({ where: { creatorId: other.creator!.id, visibility: "PPV" } });
    expect(monthly).toMatchObject({ priceCents: 3900, priceCentsUsd: 800, discountPercent: 0 });
    expect(quarter).toMatchObject({ priceCents: 11700, priceCentsUsd: 2400, discountPercent: 10 });
    expect(video).toMatchObject({ priceCents: 4900, priceCentsUsd: 1900 });

    const sarahPlan = await database.plan.findFirst({ where: { creatorId: sarah.creator!.id } });
    const sarahVideo = await database.post.findFirst({ where: { creatorId: sarah.creator!.id } });
    expect(sarahPlan).toMatchObject({ priceCents: 100, priceCentsUsd: 100 });
    expect(sarahVideo).toMatchObject({ priceCents: 100, priceCentsUsd: 100 });

    const second = await applyDefaultPrices(database, { dryRun: true, creatorIds: [other.creator!.id, sarah.creator!.id] });
    expect(second.changes.filter((change) => change.creatorId === other.creator!.id)).toEqual([]);
  });
});
