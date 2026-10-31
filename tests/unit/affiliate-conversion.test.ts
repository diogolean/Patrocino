import "../../apps/api/node_modules/reflect-metadata/Reflect.js";
import { afterAll, describe, expect, it } from "vitest";
import { database } from "../../packages/db/src/index";
import { AFFILIATE_COOKIE, affiliateCookieValue, parseAffiliateCookie } from "../../packages/core/src/currency";
import { affiliateDashboard, markCommissionPaid, recordAffiliateClick, rememberReferral } from "../../apps/api/src/modules/affiliates/tracking";
import { createPrismaPaymentStore } from "../../apps/api/src/modules/payments/expay-store";
import { ensureQuotedPurchase, quoteCharge } from "../../apps/api/src/modules/payments/quote-charge";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe("affiliate click, signup, and 20 percent commission", () => {
  const ids = { fanId: "", creatorId: "", affiliateId: "", postId: "" };

  afterAll(async () => {
    if (ids.fanId) {
      await database.commission.deleteMany({ where: { affiliateId: ids.affiliateId } });
      await database.conversion.deleteMany({ where: { purchase: { buyerId: ids.fanId } } });
      await database.ledgerEntry.deleteMany({ where: { purchase: { buyerId: ids.fanId } } });
      await database.purchase.deleteMany({ where: { buyerId: ids.fanId } });
      await database.paymentRecord.deleteMany({ where: { buyerId: ids.fanId } });
      await database.attribution.deleteMany({ where: { fanId: ids.fanId } });
    }
    if (ids.affiliateId) {
      await database.click.deleteMany({ where: { link: { affiliateId: ids.affiliateId } } });
      await database.affiliateLink.deleteMany({ where: { affiliateId: ids.affiliateId } });
      await database.affiliateAssignment.deleteMany({ where: { affiliateId: ids.affiliateId } });
      await database.affiliate.deleteMany({ where: { id: ids.affiliateId } });
    }
    await database.post.deleteMany({ where: { creatorId: ids.creatorId || undefined } });
    await database.creator.deleteMany({ where: { id: ids.creatorId || undefined } });
    await database.user.deleteMany({
      where: { email: { in: [`aff-fan-${suffix}@patrocino.test`, `aff-creator-${suffix}@patrocino.test`, `aff-partner-${suffix}@patrocino.test`] } },
    });
    await database.$disconnect();
  });

  it("records a click cookie, signup attribution, and a 20 percent commission when payment settles", async () => {
    const creatorUser = await database.user.create({
      data: {
        email: `aff-creator-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "CREATOR",
        profile: { create: { name: "Criadora Link", username: `affcreator${suffix}` } },
        creator: { create: { status: "ACTIVE", category: "Lifestyle", ownership: "HOUSE", acceptsAffiliates: true, commissionOnPpv: true } },
      },
      include: { creator: true },
    });
    const post = await database.post.create({
      data: {
        creatorId: creatorUser.creator!.id,
        caption: "Video afiliado",
        visibility: "PPV",
        priceCents: 10000,
        priceCentsUsd: 1900,
        publishedAt: new Date(),
      },
    });
    const partner = await database.user.create({
      data: {
        email: `aff-partner-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "AFFILIATE",
        profile: { create: { name: "Parceiro", username: `affpartner${suffix}` } },
        affiliate: { create: { code: `aff${suffix}`, displayName: "Parceiro", commissionBps: 2000 } },
      },
      include: { affiliate: true },
    });
    ids.creatorId = creatorUser.creator!.id;
    ids.postId = post.id;
    ids.affiliateId = partner.affiliate!.id;
    await database.affiliateAssignment.create({
      data: { affiliateId: ids.affiliateId, creatorId: ids.creatorId },
    });
    const link = await database.affiliateLink.create({
      data: { affiliateId: ids.affiliateId, creatorId: ids.creatorId, slug: `affcreator${suffix}`, code: `lnk${suffix}` },
    });

    const click = await recordAffiliateClick({ code: link.code, subId: "instagram", locale: "pt-BR", userAgent: "Mozilla/5.0" });
    expect(click?.clickId).toBeTruthy();
    const header = `${AFFILIATE_COOKIE}=${encodeURIComponent(affiliateCookieValue({
      code: link.code,
      clickId: click!.clickId,
      creatorUsername: `affcreator${suffix}`,
    }))}`;
    expect(parseAffiliateCookie(decodeURIComponent(header.split("=")[1] ?? ""))?.clickId).toBe(click!.clickId);

    const fan = await database.user.create({
      data: {
        email: `aff-fan-${suffix}@patrocino.test`,
        passwordHash: "test-only",
        role: "FAN",
        profile: { create: { name: "Indicado", username: `afffan${suffix}` } },
      },
    });
    ids.fanId = fan.id;
    await rememberReferral(fan.id, click!.clickId);
    const stored = await database.user.findUniqueOrThrow({ where: { id: fan.id } });
    expect(stored.referredClickId).toBe(click!.clickId);

    const quote = await quoteCharge({ id: fan.id }, { creatorId: ids.creatorId, purpose: "post", subjectId: post.id }, "BRL");
    expect(quote.amountCents).toBe(10000);
    const draft = {
      buyerId: fan.id,
      creatorId: ids.creatorId,
      purpose: "post" as const,
      subjectId: post.id,
      amountCents: quote.amountCents,
      currency: quote.currency,
      description: quote.description,
      customer: { name: "Indicado", email: fan.email },
      idempotencyKey: `aff-purchase-${suffix}`,
    };
    const purchase = await ensureQuotedPurchase(draft);
    const store = createPrismaPaymentStore();
    await store.insertCharge({
      providerChargeId: `chg-aff-${suffix}`,
      buyerId: fan.id,
      creatorId: ids.creatorId,
      purpose: "post",
      subjectId: post.id,
      description: quote.description,
      amountCents: quote.amountCents,
      currency: "BRL",
      status: "pending",
      billingMode: "pix_one_off",
      mandateId: null,
      copiaECola: null,
      qrCode: null,
      idempotencyKey: draft.idempotencyKey,
      accessActive: false,
    });
    await store.saveStatus(`chg-aff-${suffix}`, "paid", true);
    const commission = await database.commission.findFirstOrThrow({
      where: { affiliateId: ids.affiliateId },
      include: { conversion: true },
    });
    expect(commission.rateBps).toBe(2000);
    expect(commission.amountCents).toBe(2000);
    expect(commission.status).toBe("PENDING");
    expect(commission.conversion.amountCents).toBe(10000);
    expect(commission.conversion.purchaseId).toBe(purchase.id);
    const board = await affiliateDashboard(ids.affiliateId);
    expect(board.ledger[0]?.status).toBe("pending");
    expect(board.links[0]?.clicks).toBe(1);
    expect(board.links[0]?.conversions).toBe(1);
    expect(board.links[0]?.conversionRate).toBe(1);
    expect(board.daily.some((point) => point.conversions === 1 && point.earningsCents === 2000)).toBe(true);
    expect(board.monthly.some((point) => point.earningsCents === 2000)).toBe(true);
    await markCommissionPaid(commission.id);
    expect((await affiliateDashboard(ids.affiliateId)).ledger[0]?.status).toBe("paid");

    await store.saveStatus(`chg-aff-${suffix}`, "refunded", false);
    const reversed = await database.commission.findUniqueOrThrow({ where: { id: commission.id } });
    expect(reversed.status).toBe("REJECTED");
    const refunded = await database.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(refunded.status).toBe("REFUNDED");
    expect((await affiliateDashboard(ids.affiliateId)).ledger[0]?.status).toBe("reversed");
  });
});
