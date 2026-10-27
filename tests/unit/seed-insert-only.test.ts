import { afterAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { disconnectSeed, seedDatabase } from "../../packages/db/prisma/seed";

const SENTINEL_HASH = "sentinel-hash-seed-must-not-restore-demo-password";
const EDITED_BIO = "Bio editada no painel e que o seed não pode apagar.";
const EDITED_CATEGORY = "categoria-editada";
const EDITED_PLAN_NAME = "Mensal editado";

describe("deploy seed inserts missing rows and does not overwrite edits", () => {
  const restore: {
    sarahUserId?: string;
    sarahPassword?: string;
    sarahProfileId?: string;
    sarahBio?: string | null;
    sarahCreatorId?: string;
    sarahCategory?: string;
    sarahStatus?: "DRAFT" | "PENDING" | "ACTIVE" | "SUSPENDED";
    sarahOwnership?: "HOUSE" | "INDEPENDENT";
    monthly?: {
      id: string;
      name: string;
      priceCents: number;
      discountPercent: number;
      description: string;
      durationMonths: number;
      active: boolean;
      stripeProductId: string | null;
      stripePriceId: string | null;
      isDemo: boolean;
      creatorId: string;
    };
    removedPlan?: {
      id: string;
      creatorId: string;
      name: string;
      description: string;
      priceCents: number;
      durationMonths: number;
      discountPercent: number;
      active: boolean;
      stripeProductId: string | null;
      stripePriceId: string | null;
      isDemo: boolean;
      promotionIds: string[];
    };
    lunaUserId?: string;
    lunaPassword?: string;
    lunaPlanId?: string;
    lunaPrice?: number;
    fanId?: string;
    fanPassword?: string;
  } = {};

  afterAll(async () => {
    if (restore.sarahUserId && restore.sarahPassword) {
      await database.user.update({
        where: { id: restore.sarahUserId },
        data: { passwordHash: restore.sarahPassword },
      });
    }
    if (restore.sarahProfileId) {
      await database.profile.update({
        where: { id: restore.sarahProfileId },
        data: { bio: restore.sarahBio },
      });
    }
    if (restore.sarahCreatorId && restore.sarahCategory && restore.sarahStatus && restore.sarahOwnership) {
      await database.creator.update({
        where: { id: restore.sarahCreatorId },
        data: {
          category: restore.sarahCategory,
          status: restore.sarahStatus,
          ownership: restore.sarahOwnership,
        },
      });
    }
    if (restore.monthly) {
      await database.plan.update({
        where: { id: restore.monthly.id },
        data: {
          name: restore.monthly.name,
          priceCents: restore.monthly.priceCents,
          discountPercent: restore.monthly.discountPercent,
        },
      });
    }
    if (restore.removedPlan) {
      const recreated = await database.plan.findFirst({
        where: {
          creatorId: restore.removedPlan.creatorId,
          durationMonths: restore.removedPlan.durationMonths,
          NOT: { id: restore.removedPlan.id },
        },
      });
      if (recreated) {
        const subscriptions = await database.subscription.count({ where: { planId: recreated.id } });
        if (subscriptions === 0) await database.plan.delete({ where: { id: recreated.id } });
      }
      const original = await database.plan.findUnique({ where: { id: restore.removedPlan.id } });
      if (!original) {
        await database.plan.create({
          data: {
            id: restore.removedPlan.id,
            creatorId: restore.removedPlan.creatorId,
            name: restore.removedPlan.name,
            description: restore.removedPlan.description,
            priceCents: restore.removedPlan.priceCents,
            durationMonths: restore.removedPlan.durationMonths,
            discountPercent: restore.removedPlan.discountPercent,
            active: restore.removedPlan.active,
            stripeProductId: restore.removedPlan.stripeProductId,
            stripePriceId: restore.removedPlan.stripePriceId,
            isDemo: restore.removedPlan.isDemo,
          },
        });
      }
      if (restore.removedPlan.promotionIds.length > 0) {
        await database.promotion.updateMany({
          where: { id: { in: restore.removedPlan.promotionIds } },
          data: { planId: restore.removedPlan.id },
        });
      }
    }
    if (restore.lunaUserId && restore.lunaPassword) {
      await database.user.update({
        where: { id: restore.lunaUserId },
        data: { passwordHash: restore.lunaPassword },
      });
    }
    if (restore.lunaPlanId != null && restore.lunaPrice != null) {
      await database.plan.update({
        where: { id: restore.lunaPlanId },
        data: { priceCents: restore.lunaPrice },
      });
    }
    if (restore.fanId && restore.fanPassword) {
      await database.user.update({
        where: { id: restore.fanId },
        data: { passwordHash: restore.fanPassword },
      });
    }
    await disconnectSeed();
    await database.$disconnect();
  });

  it("keeps Sarah Mitchell's edited Mensal price, password, and creator settings", async () => {
    await seedDatabase();

    const sarah = await database.user.findUnique({
      where: { email: "sarah-mitchell@creators.patrocino.com" },
      include: { profile: true, creator: { include: { plans: true } } },
    });
    expect(sarah?.creator?.id).toBeTruthy();
    expect(sarah?.profile?.id).toBeTruthy();
    const monthly = sarah!.creator!.plans.find((plan) => plan.durationMonths === 1);
    expect(monthly?.id).toBeTruthy();

    restore.sarahUserId = sarah!.id;
    restore.sarahPassword = sarah!.passwordHash;
    restore.sarahProfileId = sarah!.profile!.id;
    restore.sarahBio = sarah!.profile!.bio;
    restore.sarahCreatorId = sarah!.creator!.id;
    restore.sarahCategory = sarah!.creator!.category;
    restore.sarahStatus = sarah!.creator!.status;
    restore.sarahOwnership = sarah!.creator!.ownership;
    restore.monthly = {
      id: monthly!.id,
      name: monthly!.name,
      priceCents: monthly!.priceCents,
      discountPercent: monthly!.discountPercent,
      description: monthly!.description,
      durationMonths: monthly!.durationMonths,
      active: monthly!.active,
      stripeProductId: monthly!.stripeProductId,
      stripePriceId: monthly!.stripePriceId,
      isDemo: monthly!.isDemo,
      creatorId: monthly!.creatorId,
    };

    const candidate = [...sarah!.creator!.plans]
      .filter((plan) => plan.durationMonths !== 1)
      .sort((a, b) => b.durationMonths - a.durationMonths);
    for (const plan of candidate) {
      const subscriptions = await database.subscription.count({ where: { planId: plan.id } });
      if (subscriptions > 0) continue;
      const promotions = await database.promotion.findMany({
        where: { planId: plan.id },
        select: { id: true },
      });
      restore.removedPlan = {
        id: plan.id,
        creatorId: plan.creatorId,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        durationMonths: plan.durationMonths,
        discountPercent: plan.discountPercent,
        active: plan.active,
        stripeProductId: plan.stripeProductId,
        stripePriceId: plan.stripePriceId,
        isDemo: plan.isDemo,
        promotionIds: promotions.map((promotion) => promotion.id),
      };
      await database.plan.delete({ where: { id: plan.id } });
      break;
    }
    expect(restore.removedPlan?.id).toBeTruthy();

    const luna = await database.user.findUnique({
      where: { email: "criadora@mimelux.com.br" },
      include: { creator: { include: { plans: true } } },
    });
    const lunaMonthly = luna?.creator?.plans.find((plan) => plan.durationMonths === 1);
    expect(lunaMonthly?.id).toBeTruthy();
    restore.lunaUserId = luna!.id;
    restore.lunaPassword = luna!.passwordHash;
    restore.lunaPlanId = lunaMonthly!.id;
    restore.lunaPrice = lunaMonthly!.priceCents;

    const fan = await database.user.findUnique({ where: { email: "fan@mimelux.com.br" } });
    expect(fan?.id).toBeTruthy();
    restore.fanId = fan!.id;
    restore.fanPassword = fan!.passwordHash;

    await database.user.update({ where: { id: sarah!.id }, data: { passwordHash: SENTINEL_HASH } });
    await database.profile.update({ where: { id: sarah!.profile!.id }, data: { bio: EDITED_BIO } });
    await database.creator.update({
      where: { id: sarah!.creator!.id },
      data: { category: EDITED_CATEGORY, status: "SUSPENDED", ownership: "INDEPENDENT" },
    });
    const edited = await database.plan.update({
      where: { id: monthly!.id },
      data: { priceCents: 100, discountPercent: 5, name: EDITED_PLAN_NAME },
    });
    await database.user.update({ where: { id: luna!.id }, data: { passwordHash: SENTINEL_HASH } });
    await database.plan.update({ where: { id: lunaMonthly!.id }, data: { priceCents: 100 } });
    await database.user.update({ where: { id: fan!.id }, data: { passwordHash: SENTINEL_HASH } });

    await seedDatabase();

    const after = await database.user.findUnique({
      where: { email: "sarah-mitchell@creators.patrocino.com" },
      include: { profile: true, creator: { include: { plans: true } } },
    });
    expect(after?.passwordHash).toBe(SENTINEL_HASH);
    expect(after?.profile?.bio).toBe(EDITED_BIO);
    expect(after?.creator?.category).toBe(EDITED_CATEGORY);
    expect(after?.creator?.status).toBe("SUSPENDED");
    expect(after?.creator?.ownership).toBe("INDEPENDENT");
    const monthlyAfter = after?.creator?.plans.find((plan) => plan.id === monthly!.id);
    expect(monthlyAfter?.priceCents).toBe(100);
    expect(monthlyAfter?.discountPercent).toBe(5);
    expect(monthlyAfter?.name).toBe(EDITED_PLAN_NAME);
    expect(monthlyAfter?.updatedAt.toISOString()).toBe(edited.updatedAt.toISOString());

    const recreated = after?.creator?.plans.find(
      (plan) => plan.durationMonths === restore.removedPlan!.durationMonths && plan.id !== monthly!.id,
    );
    expect(recreated?.id).toBeTruthy();
    expect(recreated?.priceCents).toBe(1490 * restore.removedPlan!.durationMonths);

    const lunaAfter = await database.user.findUnique({
      where: { email: "criadora@mimelux.com.br" },
      include: { creator: { include: { plans: true } } },
    });
    expect(lunaAfter?.passwordHash).toBe(SENTINEL_HASH);
    expect(lunaAfter?.creator?.plans.find((plan) => plan.id === lunaMonthly!.id)?.priceCents).toBe(100);

    const fanAfter = await database.user.findUnique({ where: { email: "fan@mimelux.com.br" } });
    expect(fanAfter?.passwordHash).toBe(SENTINEL_HASH);
  });
});
