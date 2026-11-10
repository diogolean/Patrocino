import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { listActiveCreators, loadCreatorOffers } from "../../apps/api/src/modules/creators/catalog";
import { quoteCharge } from "../../apps/api/src/modules/payments/quote-charge";
import { settlePurchase } from "../../apps/api/src/modules/payments/billing";
import { exactTrackingLink, recordAffiliateClick, rememberReferral } from "../../apps/api/src/modules/affiliates/tracking";
import { AdminCommerceController } from "../../apps/api/src/modules/admin/admin-commerce.controller";
import { AffiliateSelfLinksController } from "../../apps/api/src/modules/affiliates/affiliates.module";
import { MediaController } from "../../apps/api/src/modules/media/media.module";
import { resolveAffiliateRedirect } from "../../apps/web/lib/affiliate-redirect";
import { currencyForVisitor } from "../../packages/core/src/currency";

const { sign } = createRequire(import.meta.url)("../../apps/api/node_modules/jsonwebtoken") as {
  sign: (payload: object, secret: string) => string;
};

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const secret = process.env.JWT_ACCESS_SECRET ?? "local-access-only";
const sophieId = "sophie-draft-v1-creator";

const ids = {
  sophieUser: "",
  fanId: "",
  subscriberId: "",
  adminId: "",
  affiliateUser: "",
  affiliateId: "",
  otherCreator: "",
  otherUser: "",
  independentCreator: "",
  independentUser: "",
  planId: "",
  packId: "",
  postId: "",
  videoPostId: "",
};

function statusOf(error: unknown) {
  if (error && typeof error === "object" && "getStatus" in error && typeof error.getStatus === "function") {
    return (error as { getStatus: () => number }).getStatus();
  }
  return 0;
}

function adminToken() {
  return `Bearer ${sign({ sub: ids.adminId, role: "ADMIN" }, secret)}`;
}

async function settle(buyerId: string, creatorId: string, postId: string, amountCents: number, key: string) {
  const purchase = await database.purchase.create({
    data: {
      buyerId,
      creatorId,
      postId,
      kind: "POST",
      status: "PENDING",
      amountCents,
      idempotencyKey: key,
    },
  });
  await database.$transaction((tx) => settlePurchase(tx, purchase.id, key));
  return purchase.id;
}

describe("database-only creator", () => {
  beforeAll(async () => {
    const staleProfile = await database.profile.findUnique({ where: { username: "sophie-bennet" } });
    if (staleProfile) await database.user.delete({ where: { id: staleProfile.userId } }).catch(() => undefined);
    const staleCreator = await database.creator.findUnique({ where: { id: sophieId } });
    if (staleCreator) await database.user.delete({ where: { id: staleCreator.userId } }).catch(() => undefined);

    const sophie = await database.user.create({
      data: {
        email: `sophie-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Sophie Bennet", username: "sophie-bennet", bio: "Prévia", city: "São Paulo" } },
        creator: {
          create: {
            id: sophieId,
            status: "DRAFT",
            category: "Lifestyle",
            ownership: "HOUSE",
            acceptsAffiliates: true,
            commissionOnPpv: true,
            affiliateCommissionBps: 5000,
            defaultVideoPriceCents: 4900,
            defaultVideoPriceCentsUsd: 1900,
            guestVideoPriceCents: 5900,
            guestVideoPriceCentsUsd: 2400,
            fictitious: true,
            aiGenerated: true,
          },
        },
      },
      include: { creator: true },
    });
    ids.sophieUser = sophie.id;
    const plan = await database.plan.create({
      data: {
        creatorId: sophieId,
        name: "Mensal",
        description: "Acesso mensal",
        priceCents: 3900,
        priceCentsUsd: 800,
        durationMonths: 1,
        discountPercent: 0,
        active: false,
      },
    });
    ids.planId = plan.id;
    const pack = await database.contentPack.create({
      data: { creatorId: sophieId, name: "Pack", description: "Seleção", priceCents: 14900, priceCentsUsd: 4900, active: true },
    });
    ids.packId = pack.id;
    const video = await database.post.create({
      data: {
        creatorId: sophieId,
        caption: "secret-clip.mp4",
        visibility: "SUBSCRIBERS",
        publishedAt: new Date(Date.now() - 60_000),
        media: {
          create: {
            kind: "VIDEO",
            storageKey: `uploads/${sophieId}/private/video.mp4`,
            mimeType: "video/mp4",
            previewKey: `uploads/${sophieId}/previews/video.jpg`,
            posterKey: `uploads/${sophieId}/private/posters/video.jpg`,
            private: true,
          },
        },
      },
    });
    ids.videoPostId = video.id;
    const post = await database.post.create({
      data: {
        creatorId: sophieId,
        caption: "Vídeo pago",
        visibility: "SUBSCRIBER_PPV",
        priceCents: 4900,
        priceCentsUsd: 1900,
        guestPriceCents: 5900,
        guestPriceCentsUsd: 2400,
        publishedAt: new Date(Date.now() - 30_000),
        media: {
          create: {
            kind: "VIDEO",
            storageKey: `uploads/${sophieId}/private/ppv.mp4`,
            mimeType: "video/mp4",
            previewKey: `uploads/${sophieId}/previews/ppv.jpg`,
            posterKey: `uploads/${sophieId}/private/posters/ppv.jpg`,
            private: true,
          },
        },
      },
    });
    ids.postId = post.id;
    const fan = await database.user.create({
      data: { email: `sophie-fan-${suffix}@patrocino.test`, passwordHash: "test-only", role: "FAN" },
    });
    const subscriber = await database.user.create({
      data: { email: `sophie-sub-${suffix}@patrocino.test`, passwordHash: "test-only", role: "FAN" },
    });
    ids.fanId = fan.id;
    ids.subscriberId = subscriber.id;
    const admin = await database.user.create({
      data: { email: `sophie-admin-${suffix}@patrocino.test`, passwordHash: "test-only", role: "ADMIN" },
    });
    ids.adminId = admin.id;
    const partner = await database.user.create({
      data: {
        email: `sophie-affiliate-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "ADMIN",
        affiliate: { create: { code: `sof${suffix}`, displayName: "Diogo", commissionBps: 2000, status: "ACTIVE" } },
      },
      include: { affiliate: true },
    });
    ids.affiliateUser = partner.id;
    ids.affiliateId = partner.affiliate!.id;
    const other = await database.user.create({
      data: {
        email: `other-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Outra", username: `other${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle", ownership: "HOUSE", acceptsAffiliates: true, commissionOnPpv: true } },
      },
      include: { creator: true },
    });
    ids.otherUser = other.id;
    ids.otherCreator = other.creator!.id;
    await database.post.create({
      data: { creatorId: ids.otherCreator, caption: "Pago", visibility: "PPV", priceCents: 10000, priceCentsUsd: 1900, publishedAt: new Date() },
    });
    const independent = await database.user.create({
      data: {
        email: `indie-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Indie", username: `indie${suffix}` } },
        creator: {
          create: {
            status: "ACTIVE",
            category: "Lifestyle",
            ownership: "INDEPENDENT",
            creatorShareBps: 3000,
            affiliateCommissionBps: 5000,
            acceptsAffiliates: true,
            commissionOnPpv: true,
          },
        },
      },
      include: { creator: true },
    });
    ids.independentUser = independent.id;
    ids.independentCreator = independent.creator!.id;
    await database.post.create({
      data: { creatorId: ids.independentCreator, caption: "Indie", visibility: "PPV", priceCents: 10000, publishedAt: new Date() },
    });
  });

  afterAll(async () => {
    const creatorIds = [sophieId, ids.otherCreator, ids.independentCreator].filter(Boolean);
    const userIds = [ids.sophieUser, ids.fanId, ids.subscriberId, ids.adminId, ids.affiliateUser, ids.otherUser, ids.independentUser].filter(Boolean);
    if (ids.affiliateId) {
      await database.commission.deleteMany({ where: { affiliateId: ids.affiliateId } });
      await database.conversion.deleteMany({ where: { attribution: { click: { link: { affiliateId: ids.affiliateId } } } } });
      await database.ledgerEntry.deleteMany({ where: { OR: [{ creatorId: { in: creatorIds } }, { userId: ids.affiliateUser }] } });
      await database.purchase.deleteMany({ where: { creatorId: { in: creatorIds } } });
      await database.attribution.deleteMany({ where: { click: { link: { affiliateId: ids.affiliateId } } } });
      await database.click.deleteMany({ where: { link: { affiliateId: ids.affiliateId } } });
      await database.affiliateLink.deleteMany({ where: { affiliateId: ids.affiliateId } });
      await database.affiliateAssignment.deleteMany({ where: { affiliateId: ids.affiliateId } });
      await database.affiliate.deleteMany({ where: { id: ids.affiliateId } });
    }
    await database.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await database.subscription.deleteMany({ where: { creatorId: { in: creatorIds } } });
    await database.media.deleteMany({ where: { post: { creatorId: { in: creatorIds } } } });
    await database.post.deleteMany({ where: { creatorId: { in: creatorIds } } });
    await database.contentPack.deleteMany({ where: { creatorId: { in: creatorIds } } });
    await database.plan.deleteMany({ where: { creatorId: { in: creatorIds } } });
    await database.creator.deleteMany({ where: { id: { in: creatorIds } } });
    await database.profile.deleteMany({ where: { userId: { in: userIds } } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("stays unpublished while DRAFT and works end to end once ACTIVE", async () => {
    expect(await loadCreatorOffers("sophie-bennet", "USD")).toBeNull();
    const hidden = await listActiveCreators({ currency: "USD", includeDemo: true });
    expect(hidden.some((item) => item.username === "sophie-bennet")).toBe(false);
    const admin = new AdminCommerceController();
    const self = new AffiliateSelfLinksController();
    await expect(admin.link(ids.affiliateId, adminToken(), { creatorId: sophieId })).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 400,
    );
    await expect(self.create(`Bearer ${sign({ sub: ids.affiliateUser }, secret)}`, { creatorId: sophieId })).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 404,
    );
    expect(await exactTrackingLink("missing1", "sophie-bennet")).toBeNull();

    await database.creator.update({ where: { id: sophieId }, data: { status: "ACTIVE" } });
    await database.plan.update({ where: { id: ids.planId }, data: { active: true } });

    const brl = await loadCreatorOffers("sophie-bennet", "BRL");
    const usd = await loadCreatorOffers("sophie-bennet", "USD");
    expect(brl?.name).toBe("Sophie Bennet");
    expect(brl?.username).toBe("sophie-bennet");
    expect(brl?.plans[0]?.chargeCents).toBe(3900);
    expect(usd?.plans[0]?.chargeCents).toBe(800);
    expect(brl?.packs[0]?.priceCents).toBe(14900);
    expect(usd?.packs[0]?.priceCents).toBe(4900);
    expect(JSON.stringify(brl)).not.toContain("secret-clip.mp4");
    expect(JSON.stringify(brl)).not.toContain("/private/");
    const video = brl?.posts.find((post) => post.mediaType === "video");
    expect(video?.caption).toBe("Vídeo exclusivo #1");
    expect(video?.image).toContain("/previews/");
    expect(await listActiveCreators({ currency: "USD", includeDemo: true })).toEqual(
      expect.arrayContaining([expect.objectContaining({ username: "sophie-bennet", monthlyPriceCents: 800 })]),
    );
    expect(currencyForVisitor({})).toBe("USD");
    expect(currencyForVisitor({ country: "BR" })).toBe("BRL");
    expect(currencyForVisitor({ country: "US" })).toBe("USD");

    const guest = await quoteCharge({ id: ids.fanId }, { creatorId: "sophie-bennet", purpose: "post", subjectId: ids.postId }, "BRL");
    expect(guest.amountCents).toBe(5900);
    const guestUsd = await quoteCharge({ id: ids.fanId }, { creatorId: sophieId, purpose: "post", subjectId: ids.postId }, "USD");
    expect(guestUsd.amountCents).toBe(2400);
    await database.subscription.create({
      data: {
        fanId: ids.subscriberId,
        creatorId: sophieId,
        planId: ids.planId,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 86_400_000),
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      },
    });
    const member = await quoteCharge({ id: ids.subscriberId }, { creatorId: sophieId, purpose: "post", subjectId: ids.postId }, "BRL");
    expect(member.amountCents).toBe(4900);
    const memberUsd = await quoteCharge({ id: ids.subscriberId }, { creatorId: sophieId, purpose: "post", subjectId: ids.postId }, "USD");
    expect(memberUsd.amountCents).toBe(1900);
    const subscription = await quoteCharge({ id: ids.fanId }, { creatorId: sophieId, purpose: "subscription", subjectId: ids.planId }, "BRL");
    expect(subscription.amountCents).toBe(3900);
    const subscriptionUsd = await quoteCharge({ id: ids.fanId }, { creatorId: sophieId, purpose: "subscription", subjectId: ids.planId }, "USD");
    expect(subscriptionUsd.amountCents).toBe(800);
    const pack = await quoteCharge({ id: ids.fanId }, { creatorId: sophieId, purpose: "pack", subjectId: ids.packId }, "BRL");
    expect(pack.amountCents).toBe(14900);
    const packUsd = await quoteCharge({ id: ids.fanId }, { creatorId: sophieId, purpose: "pack", subjectId: ids.packId }, "USD");
    expect(packUsd.amountCents).toBe(4900);

    const catalog = new MediaController();
    const videos = await catalog.subscriberVideos("sophie-bennet");
    expect(JSON.stringify(videos)).not.toContain("secret-clip");
    expect(JSON.stringify(videos)).not.toContain("/private/");
    expect(videos.items[0]?.previewUrl).toContain("/previews/");

    const linked = await admin.link(ids.affiliateId, adminToken(), { creatorId: sophieId });
    expect(linked.path).toMatch(/^\/sophie-bennet\/[a-z0-9]{6,12}$/);
    const code = linked.code;
    const click = await recordAffiliateClick({ code, creator: "sophie-bennet", exact: true, userAgent: "Mozilla/5.0" });
    expect(click?.creatorUsername).toBe("sophie-bennet");
    const landing = await resolveAffiliateRedirect({
      code,
      requestedCreator: "sophie-bennet",
      secure: true,
      record: async () => click,
    });
    expect(landing.location.startsWith("/creator/sophie-bennet")).toBe(true);
    expect(landing.cookie?.value).toContain(click!.clickId);
    await rememberReferral(ids.fanId, click!.clickId);

    const otherPost = await database.post.findFirstOrThrow({ where: { creatorId: ids.otherCreator } });
    const otherLink = await database.affiliateLink.create({
      data: { affiliateId: ids.affiliateId, creatorId: ids.otherCreator, slug: `other${suffix}`, code: `oth${suffix}`.slice(0, 12) },
    });
    const otherClick = await recordAffiliateClick({ code: otherLink.code, creator: `other${suffix}`, exact: true, userAgent: "Mozilla/5.0" });
    await rememberReferral(ids.subscriberId, otherClick!.clickId);
    await settle(ids.subscriberId, ids.otherCreator, otherPost.id, 10000, `other-a-${suffix}`);
    const kept = await database.commission.findFirstOrThrow({ where: { affiliateId: ids.affiliateId, conversion: { purchase: { creatorId: ids.otherCreator } } } });
    expect(kept.rateBps).toBe(2000);
    expect(kept.amountCents).toBe(2000);
    await database.creator.update({ where: { id: ids.otherCreator }, data: { affiliateCommissionBps: 5000 } });
    const still = await database.commission.findUniqueOrThrow({ where: { id: kept.id } });
    expect(still.rateBps).toBe(2000);
    expect(still.amountCents).toBe(2000);

    await settle(ids.fanId, sophieId, ids.postId, 10000, `sophie-a-${suffix}`);
    const sophieCommission = await database.commission.findFirstOrThrow({
      where: { affiliateId: ids.affiliateId, conversion: { purchase: { idempotencyKey: `sophie-a-${suffix}` } } },
    });
    expect(sophieCommission.rateBps).toBe(5000);
    expect(sophieCommission.amountCents).toBe(5000);
    await admin.assign(ids.affiliateId, adminToken(), { creatorId: sophieId, commissionPercent: 10 });
    await settle(ids.fanId, sophieId, ids.postId, 10000, `sophie-b-${suffix}`);
    const overridden = await database.commission.findFirstOrThrow({
      where: { affiliateId: ids.affiliateId, conversion: { purchase: { idempotencyKey: `sophie-b-${suffix}` } } },
    });
    expect(overridden.rateBps).toBe(1000);
    expect((await database.commission.findUniqueOrThrow({ where: { id: sophieCommission.id } })).rateBps).toBe(5000);

    const indiePost = await database.post.findFirstOrThrow({ where: { creatorId: ids.independentCreator } });
    const indieLink = await database.affiliateLink.create({
      data: { affiliateId: ids.affiliateId, creatorId: ids.independentCreator, slug: `indie${suffix}`, code: `ind${suffix}`.slice(0, 12) },
    });
    const indieClick = await recordAffiliateClick({ code: indieLink.code, creator: `indie${suffix}`, exact: true, userAgent: "Mozilla/5.0" });
    await rememberReferral(ids.fanId, indieClick!.clickId);
    await expect(settle(ids.fanId, ids.independentCreator, indiePost.id, 10000, `indie-${suffix}`)).resolves.toEqual(expect.any(String));
    const indieCommission = await database.commission.findFirstOrThrow({
      where: { affiliateId: ids.affiliateId, conversion: { purchase: { idempotencyKey: `indie-${suffix}` } } },
    });
    expect(indieCommission.rateBps).toBe(3000);
    expect(indieCommission.amountCents).toBe(3000);
  });
});
