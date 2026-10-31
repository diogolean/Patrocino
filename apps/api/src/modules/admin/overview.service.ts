import { database } from "@mimelux/db/runtime";
import { addMoney, monthlyCents, providerOf, rate, sumByCurrency, type Money } from "./overview-math";
import { bucketIndex, bucketStarts, mainCurrency, percentDelta, type OverviewRange } from "./overview-range";

const real = { isDemo: false } as const;
const STUCK_AFTER_MS = 3_600_000;

type PaidRow = { amountCents: number; currency: string; kind: string; providerRef: string | null; creatorId: string; buyerId: string; createdAt: Date };

function paidBetween(from: Date, to: Date): Promise<PaidRow[]> {
  return database.purchase.findMany({
    where: { ...real, status: "PAID", createdAt: { gte: from, lt: to } },
    select: { amountCents: true, currency: true, kind: true, providerRef: true, creatorId: true, buyerId: true, createdAt: true },
  });
}

function moneyKpi(current: Money, previous: Money) {
  const currency = mainCurrency(current, previous);
  return { current, previous, currency, delta: percentDelta(current[currency] ?? 0, previous[currency] ?? 0) };
}

function countKpi(current: number, previous: number) {
  return { current, previous, delta: percentDelta(current, previous) };
}

export async function loadSales(range: OverviewRange) {
  const [paid, prevPaid] = await Promise.all([paidBetween(range.from, range.to), paidBetween(range.prevFrom, range.prevTo)]);
  const starts = bucketStarts(range);
  const series = starts.map((start) => ({ t: start.toISOString(), revenue: {} as Money, prevRevenue: {} as Money, sales: 0 }));
  for (const row of paid) {
    const point = series[bucketIndex(row.createdAt, range.from, range.bucket)];
    if (!point) continue;
    addMoney(point.revenue, row.currency, row.amountCents);
    point.sales += 1;
  }
  for (const row of prevPaid) {
    const point = series[bucketIndex(row.createdAt, range.prevFrom, range.bucket)];
    if (point) addMoney(point.prevRevenue, row.currency, row.amountCents);
  }
  const byProvider: Record<string, Money> = {};
  const byType: Record<string, { count: number; amount: Money }> = {};
  for (const row of paid) {
    addMoney((byProvider[providerOf(row.providerRef)] ??= {}), row.currency, row.amountCents);
    const type = (byType[row.kind] ??= { count: 0, amount: {} });
    type.count += 1;
    addMoney(type.amount, row.currency, row.amountCents);
  }
  return {
    paid,
    revenue: moneyKpi(sumByCurrency(paid), sumByCurrency(prevPaid)),
    sales: countKpi(paid.length, prevPaid.length),
    buyers: countKpi(new Set(paid.map((row) => row.buyerId)).size, new Set(prevPaid.map((row) => row.buyerId)).size),
    series,
    byProvider,
    byType,
  };
}

export async function loadSubscriptions(range: OverviewRange) {
  const select = { currency: true, plan: { select: { priceCents: true, priceCentsUsd: true, durationMonths: true } } } as const;
  const [active, activeAtStart, created, prevCreated, churned, prevChurned] = await Promise.all([
    database.subscription.findMany({ where: { ...real, status: { in: ["ACTIVE", "PAST_DUE"] } }, select }),
    // Approximation: live at the start of the window = created before it and not ended before it.
    database.subscription.findMany({
      where: {
        ...real,
        createdAt: { lt: range.from },
        OR: [{ status: { in: ["ACTIVE", "PAST_DUE"] } }, { status: { in: ["CANCELED", "EXPIRED"] }, updatedAt: { gte: range.from } }],
      },
      select,
    }),
    database.subscription.count({ where: { ...real, status: { not: "PENDING" }, createdAt: { gte: range.from, lt: range.to } } }),
    database.subscription.count({ where: { ...real, status: { not: "PENDING" }, createdAt: { gte: range.prevFrom, lt: range.prevTo } } }),
    database.subscription.count({ where: { ...real, status: { in: ["CANCELED", "EXPIRED"] }, updatedAt: { gte: range.from, lt: range.to } } }),
    database.subscription.count({ where: { ...real, status: { in: ["CANCELED", "EXPIRED"] }, updatedAt: { gte: range.prevFrom, lt: range.prevTo } } }),
  ]);
  const mrrOf = (rows: typeof active) => rows.reduce<Money>((acc, sub) => addMoney(acc, sub.currency, monthlyCents(sub.plan, sub.currency)), {});
  return {
    mrr: moneyKpi(mrrOf(active), mrrOf(activeAtStart)),
    active: countKpi(active.length, activeAtStart.length),
    created: countKpi(created, prevCreated),
    churned: countKpi(churned, prevChurned),
  };
}

export async function loadFunnel(range: OverviewRange, buyers: { current: number; previous: number }) {
  const window = (from: Date, to: Date) => ({ createdAt: { gte: from, lt: to } });
  const [clicks, signups, attributed, prevClicks, prevSignups] = await Promise.all([
    database.click.count({ where: { ...real, ...window(range.from, range.to) } }),
    database.user.count({ where: { ...real, role: "FAN", ...window(range.from, range.to) } }),
    database.attribution.count({ where: { ...real, fanId: { not: null }, ...window(range.from, range.to) } }),
    database.click.count({ where: { ...real, ...window(range.prevFrom, range.prevTo) } }),
    database.user.count({ where: { ...real, role: "FAN", ...window(range.prevFrom, range.prevTo) } }),
  ]);
  const conversion = rate(buyers.current, signups);
  const prevConversion = rate(buyers.previous, prevSignups);
  return {
    visits: null,
    clicks: countKpi(clicks, prevClicks),
    signups: countKpi(signups, prevSignups),
    attributedSignups: attributed,
    buyers: buyers.current,
    conversion: { current: conversion, previous: prevConversion, delta: Math.round((conversion - prevConversion) * 10) / 10 },
    clickToSignup: rate(attributed, clicks),
  };
}

export async function loadTopCreators(paid: PaidRow[]) {
  const revenue = new Map<string, Money>();
  const sales = new Map<string, number>();
  for (const row of paid) {
    addMoney(revenue.get(row.creatorId) ?? revenue.set(row.creatorId, {}).get(row.creatorId)!, row.currency, row.amountCents);
    sales.set(row.creatorId, (sales.get(row.creatorId) ?? 0) + 1);
  }
  // Real sales count even when the creator profile is still flagged as demo.
  const creators = await database.creator.findMany({
    where: { status: "ACTIVE", OR: [{ isDemo: false }, { id: { in: [...revenue.keys()] } }] },
    select: {
      id: true,
      user: { select: { profile: { select: { name: true, username: true } } } },
      posts: { where: { deletedAt: null }, select: { media: { select: { kind: true } } } },
      _count: { select: { subscriptions: { where: { status: { in: ["ACTIVE", "PAST_DUE"] }, isDemo: false } } } },
    },
  });
  return creators
    .map((creator) => {
      let videos = 0;
      let photos = 0;
      for (const post of creator.posts) for (const media of post.media) media.kind === "VIDEO" ? videos++ : photos++;
      const money = revenue.get(creator.id) ?? {};
      return {
        id: creator.id,
        name: creator.user.profile?.name ?? "",
        username: creator.user.profile?.username ?? "",
        revenue: money,
        sales: sales.get(creator.id) ?? 0,
        activeSubs: creator._count.subscriptions,
        videos,
        photos,
        rank: (money.BRL ?? 0) + (money.USD ?? 0) * 5,
      };
    })
    .sort((a, b) => b.rank - a.rank || b.videos - a.videos || b.photos - a.photos)
    .slice(0, 10)
    .map(({ rank: _rank, ...rest }) => rest);
}

export async function loadAffiliates(range: OverviewRange) {
  const window = { gte: range.from, lt: range.to };
  const affiliates = await database.affiliate.findMany({
    where: real,
    select: {
      id: true,
      displayName: true,
      links: { select: { _count: { select: { clicks: { where: { isDemo: false, createdAt: window } } } } } },
      commissions: { where: real, select: { amountCents: true, currency: true, status: true, createdAt: true } },
    },
  });
  return affiliates
    .map((affiliate) => {
      const pending: Money = {};
      const paid: Money = {};
      for (const row of affiliate.commissions) {
        if (row.status === "PAID") addMoney(paid, row.currency, row.amountCents);
        else if (row.status !== "REJECTED") addMoney(pending, row.currency, row.amountCents);
      }
      return {
        id: affiliate.id,
        name: affiliate.displayName,
        clicks: affiliate.links.reduce((sum, link) => sum + link._count.clicks, 0),
        sales: affiliate.commissions.filter((row) => row.createdAt >= range.from && row.createdAt < range.to).length,
        pending,
        paid,
      };
    })
    .sort((a, b) => b.sales - a.sales || b.clicks - a.clicks)
    .slice(0, 20);
}

export async function loadHealth(range: OverviewRange, now: Date) {
  const window = { gte: range.from, lt: range.to };
  const [pixPending, pixFailed, failed, stuck, refunded] = await Promise.all([
    database.paymentRecord.findMany({ where: { status: "pending" }, select: { amountCents: true, currency: true } }),
    database.paymentRecord.count({ where: { status: { in: ["failed", "expired", "canceled", "cancelled"] }, updatedAt: window } }),
    database.purchase.count({ where: { ...real, status: "FAILED", updatedAt: window } }),
    database.purchase.count({ where: { ...real, status: "PENDING", createdAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } } }),
    database.purchase.count({ where: { ...real, status: "REFUNDED", updatedAt: window } }),
  ]);
  return { pixPending: { count: pixPending.length, amount: sumByCurrency(pixPending) }, pixFailed, purchasesFailed: failed, purchasesStuck: stuck, refunded };
}
