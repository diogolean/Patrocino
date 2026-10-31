import { apiError } from "../../http/api-error";
import { Controller, Get, Headers } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { database } from "@mimelux/db/runtime";
import { requireUser } from "../auth/require-user";
import { DAY_MS, addMoney, monthlyCents, providerOf, rate, startOfSaoPauloDay, sumByCurrency, type Money } from "./overview-math";

const real = { isDemo: false } as const;

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
export class AdminOverviewController {
  @Get("overview")
  async overview(@Headers("authorization") authorization: string | undefined) {
    const user = await requireUser(authorization);
    if (user.role !== "ADMIN") throw apiError(403, "ADMIN_ONLY", "Admin only");
    const now = new Date();
    const today = startOfSaoPauloDay(now);
    const d7 = new Date(now.getTime() - 7 * DAY_MS);
    const d30 = new Date(now.getTime() - 30 * DAY_MS);

    const paid30 = await database.purchase.findMany({
      where: { ...real, status: "PAID", createdAt: { gte: d30 } },
      select: { amountCents: true, currency: true, kind: true, providerRef: true, creatorId: true, buyerId: true, createdAt: true },
    });
    const revenue = {
      today: sumByCurrency(paid30.filter((row) => row.createdAt >= today)),
      d7: sumByCurrency(paid30.filter((row) => row.createdAt >= d7)),
      d30: sumByCurrency(paid30),
      allTime: sumByCurrency(
        await database.purchase.findMany({ where: { ...real, status: "PAID" }, select: { amountCents: true, currency: true } }),
      ),
    };
    const byProvider: Record<string, Money> = {};
    const byType: Record<string, { count: number; amount: Money }> = {};
    for (const row of paid30) {
      addMoney((byProvider[providerOf(row.providerRef)] ??= {}), row.currency, row.amountCents);
      const type = byType[row.kind] ?? (byType[row.kind] = { count: 0, amount: {} });
      type.count += 1;
      addMoney(type.amount, row.currency, row.amountCents);
    }

    const active = await database.subscription.findMany({
      where: { ...real, status: { in: ["ACTIVE", "PAST_DUE"] } },
      select: { currency: true, plan: { select: { priceCents: true, priceCentsUsd: true, durationMonths: true } } },
    });
    const mrr: Money = {};
    for (const sub of active) addMoney(mrr, sub.currency, monthlyCents(sub.plan, sub.currency));
    const [newSubs, churned] = await Promise.all([
      database.subscription.count({ where: { ...real, status: { not: "PENDING" }, createdAt: { gte: d30 } } }),
      database.subscription.count({ where: { ...real, status: { in: ["CANCELED", "EXPIRED"] }, updatedAt: { gte: d30 } } }),
    ]);

    const [clicks30, signups30, attributedSignups30] = await Promise.all([
      database.click.count({ where: { ...real, createdAt: { gte: d30 } } }),
      database.user.count({ where: { ...real, createdAt: { gte: d30 }, role: { in: ["FAN"] } } }),
      database.attribution.count({ where: { ...real, fanId: { not: null }, createdAt: { gte: d30 } } }),
    ]);
    const buyers30 = new Set(paid30.map((row) => row.buyerId)).size;

    // Real sales count even when the creator profile is still flagged as demo.
    const sellingCreatorIds = [...new Set(paid30.map((row) => row.creatorId))];
    const creators = await database.creator.findMany({
      where: { status: "ACTIVE", OR: [{ isDemo: false }, { id: { in: sellingCreatorIds } }] },
      select: {
        id: true,
        user: { select: { profile: { select: { name: true, username: true } } } },
        posts: { where: { deletedAt: null }, select: { media: { select: { kind: true } } } },
        _count: { select: { subscriptions: { where: { status: { in: ["ACTIVE", "PAST_DUE"] }, isDemo: false } } } },
      },
    });
    const revenueByCreator = new Map<string, Money>();
    const salesByCreator = new Map<string, number>();
    for (const row of paid30) {
      addMoney(revenueByCreator.get(row.creatorId) ?? revenueByCreator.set(row.creatorId, {}).get(row.creatorId)!, row.currency, row.amountCents);
      salesByCreator.set(row.creatorId, (salesByCreator.get(row.creatorId) ?? 0) + 1);
    }
    const topCreators = creators
      .map((creator) => {
        let videos = 0;
        let photos = 0;
        for (const post of creator.posts) for (const media of post.media) media.kind === "VIDEO" ? videos++ : photos++;
        const money = revenueByCreator.get(creator.id) ?? {};
        return {
          id: creator.id,
          name: creator.user.profile?.name ?? "",
          username: creator.user.profile?.username ?? "",
          revenue30: money,
          sales30: salesByCreator.get(creator.id) ?? 0,
          activeSubs: creator._count.subscriptions,
          videos,
          photos,
          sortKey: (money.BRL ?? 0) + (money.USD ?? 0) * 5,
        };
      })
      .sort((a, b) => b.sortKey - a.sortKey || b.videos - a.videos || b.photos - a.photos)
      .slice(0, 10)
      .map(({ sortKey: _ignored, ...rest }) => rest);

    const affiliates = await database.affiliate.findMany({
      where: real,
      select: {
        id: true,
        displayName: true,
        links: { select: { _count: { select: { clicks: { where: { isDemo: false } } } } } },
        commissions: { where: real, select: { amountCents: true, currency: true, status: true } },
      },
    });
    const affiliateRows = affiliates
      .map((affiliate) => {
        const pending: Money = {};
        const paidOut: Money = {};
        for (const row of affiliate.commissions) {
          if (row.status === "PAID") addMoney(paidOut, row.currency, row.amountCents);
          else if (row.status !== "REJECTED") addMoney(pending, row.currency, row.amountCents);
        }
        return {
          id: affiliate.id,
          name: affiliate.displayName,
          clicks: affiliate.links.reduce((sum, link) => sum + link._count.clicks, 0),
          sales: affiliate.commissions.length,
          pending,
          paid: paidOut,
        };
      })
      .sort((a, b) => b.sales - a.sales || b.clicks - a.clicks)
      .slice(0, 20);

    const [pixPending, pixFailed30, purchasesFailed30, purchasesPending, refunded30] = await Promise.all([
      database.paymentRecord.findMany({ where: { status: "pending" }, select: { amountCents: true, currency: true } }),
      database.paymentRecord.count({ where: { status: { in: ["failed", "expired", "canceled", "cancelled"] }, updatedAt: { gte: d30 } } }),
      database.purchase.count({ where: { ...real, status: "FAILED", updatedAt: { gte: d30 } } }),
      database.purchase.count({ where: { ...real, status: "PENDING", createdAt: { lt: new Date(now.getTime() - 3_600_000) } } }),
      database.purchase.count({ where: { ...real, status: "REFUNDED", updatedAt: { gte: d30 } } }),
    ]);

    return {
      generatedAt: now.toISOString(),
      revenue,
      byProvider,
      byType,
      subscriptions: { active: active.length, mrr, new30: newSubs, churned30: churned },
      funnel: {
        visits: null,
        clicks30,
        signups30,
        attributedSignups30,
        buyers30,
        sales30: paid30.length,
        clickToSignup: rate(attributedSignups30, clicks30),
        signupToBuyer: rate(buyers30, signups30),
      },
      topCreators,
      affiliates: affiliateRows,
      health: {
        pixPending: { count: pixPending.length, amount: sumByCurrency(pixPending) },
        pixFailed30,
        purchasesFailed30,
        purchasesStuck: purchasesPending,
        refunded30,
      },
    };
  }
}
