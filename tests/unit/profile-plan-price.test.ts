import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { loadCreatorOffers } from "../../apps/api/src/modules/creators/catalog";
import { chargeForPlan } from "../../apps/api/src/modules/payments/plan-price";
import { quoteCharge } from "../../apps/api/src/modules/payments/quote-charge";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const ids = {
  fanId: "",
  creatorUserId: "",
  creatorId: "",
  monthlyId: "",
  quarterlyId: "",
  packId: "",
  promotionId: "",
};

describe("profile prices follow the database plan", () => {
  beforeAll(async () => {
    const fan = await database.user.create({
      data: {
        email: `profile-fan-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Apoiador", username: `profilefan${suffix}` } },
      },
    });
    const creatorUser = await database.user.create({
      data: {
        email: `profile-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Sarah Mitchell", username: `sarah${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Beleza" } },
      },
      include: { creator: true },
    });
    const monthly = await database.plan.create({
      data: {
        creatorId: creatorUser.creator!.id,
        name: "Mensal",
        description: "Plano mensal",
        priceCents: 100,
        durationMonths: 1,
        discountPercent: 0,
        active: true,
      },
    });
    const quarterly = await database.plan.create({
      data: {
        creatorId: creatorUser.creator!.id,
        name: "3 meses",
        description: "Plano trimestral",
        priceCents: 300,
        durationMonths: 3,
        discountPercent: 10,
        active: true,
      },
    });
    const pack = await database.contentPack.create({
      data: {
        creatorId: creatorUser.creator!.id,
        name: "Bastidores",
        description: "Pacote",
        priceCents: 777,
        active: true,
      },
    });
    ids.fanId = fan.id;
    ids.creatorUserId = creatorUser.id;
    ids.creatorId = creatorUser.creator!.id;
    ids.monthlyId = monthly.id;
    ids.quarterlyId = quarterly.id;
    ids.packId = pack.id;
  });

  afterAll(async () => {
    if (ids.promotionId) await database.promotion.deleteMany({ where: { id: ids.promotionId } });
    if (ids.creatorId) {
      await database.promotion.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.contentPack.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.plan.deleteMany({ where: { creatorId: ids.creatorId } });
      await database.creator.deleteMany({ where: { id: ids.creatorId } });
    }
    const userIds = [ids.fanId, ids.creatorUserId].filter(Boolean);
    if (userIds.length) {
      await database.profile.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await database.$disconnect();
  });

  it("shows the stored Mensal price, not the old demo rounding", async () => {
    expect(Math.round(2990 * 0.5)).toBe(1495);
    expect(chargeForPlan({ id: "fixture", priceCents: 1490, discountPercent: 0 }, []).chargeCents).toBe(1490);

    const offers = await loadCreatorOffers(`sarah${suffix}`);
    expect(offers).not.toBeNull();
    const monthly = offers!.plans.find((plan) => plan.months === 1);
    const quarterly = offers!.plans.find((plan) => plan.months === 3);
    expect(monthly?.chargeCents).toBe(100);
    expect(quarterly?.chargeCents).toBe(270);
    expect(offers!.packs[0]?.priceCents).toBe(777);
    expect(offers!.promotion).toBeNull();

    const user = { id: ids.fanId };
    const monthlyQuote = await quoteCharge(user, {
      creatorId: offers!.username,
      purpose: "subscription",
      subjectId: monthly!.id,
    });
    const quarterlyQuote = await quoteCharge(user, {
      creatorId: offers!.id,
      purpose: "subscription",
      subjectId: "quarterly",
    });
    const packQuote = await quoteCharge(user, {
      creatorId: offers!.username,
      purpose: "pack",
      subjectId: ids.packId,
    });
    expect(monthlyQuote.amountCents).toBe(monthly!.chargeCents);
    expect(quarterlyQuote.amountCents).toBe(quarterly!.chargeCents);
    expect(quarterlyQuote.subjectId).toBe(ids.quarterlyId);
    expect(packQuote.amountCents).toBe(777);
  });

  it("applies a database promotion to the profile and the charge", async () => {
    const promotion = await database.promotion.create({
      data: {
        creatorId: ids.creatorId,
        name: "Estreia",
        discountPercent: 50,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 86_400_000),
        active: true,
      },
    });
    ids.promotionId = promotion.id;
    const offers = await loadCreatorOffers(ids.creatorId);
    const monthly = offers!.plans.find((plan) => plan.id === ids.monthlyId);
    expect(monthly?.chargeCents).toBe(50);
    expect(offers!.promotion?.discountPercent).toBe(50);
    const quote = await quoteCharge(
      { id: ids.fanId },
      { creatorId: ids.creatorId, purpose: "subscription", subjectId: ids.monthlyId },
    );
    expect(quote.amountCents).toBe(50);
    expect(quote.amountCents).toBe(monthly!.chargeCents);
  });
});
