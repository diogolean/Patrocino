import { createHash } from "node:crypto";
import { database, Prisma } from "@mimelux/db/runtime";
import { AFFILIATE_WINDOW_DAYS, conversionRate, presentCommissionStatus, progressionSeries, type LedgerStatus } from "@mimelux/core/currency";

const windowMs = AFFILIATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function ipHash(ip: string | null | undefined) {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function suspicious(subId: string, userAgent: string | null) {
  return !userAgent || /bot|spider|crawler|spam/i.test(subId) || /bot|crawler/i.test(userAgent);
}

export async function findTrackingLink(code: string) {
  const key = code.trim();
  if (!key) return null;
  return database.affiliateLink.findFirst({
    where: { active: true, OR: [{ code: key }, { slug: key }] },
    include: {
      affiliate: true,
      creator: { include: { user: { include: { profile: true } } } },
    },
  });
}

export async function recordAffiliateClick(input: {
  code: string;
  subId?: string | null;
  locale?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const link = await findTrackingLink(input.code);
  if (!link || link.affiliate.status !== "ACTIVE") return null;
  const subId = (input.subId || "direct").slice(0, 40);
  const click = await database.click.create({
    data: {
      linkId: link.id,
      subId,
      locale: input.locale?.slice(0, 12) ?? null,
      ipHash: ipHash(input.ip),
      userAgent: input.userAgent?.slice(0, 240) ?? null,
      suspicious: suspicious(subId, input.userAgent ?? null),
    },
  });
  const expiresAt = new Date(click.createdAt.getTime() + windowMs);
  await database.attribution.create({
    data: {
      clickId: click.id,
      expiresAt,
      blockedReason: click.suspicious ? "suspicious" : null,
    },
  });
  return {
    clickId: click.id,
    code: link.code,
    creatorUsername: link.creator.user.profile?.username ?? link.creatorId,
    creatorId: link.creatorId,
    affiliateId: link.affiliateId,
    clickedAt: click.createdAt.toISOString(),
  };
}

export async function rememberReferral(fanId: string, clickId: string | null | undefined) {
  if (!fanId || !clickId) return null;
  const click = await database.click.findUnique({
    where: { id: clickId },
    include: { link: { include: { affiliate: true } }, attribution: true },
  });
  if (!click) return null;
  if (Date.now() - click.createdAt.getTime() > windowMs) return null;
  const self = click.link.affiliate.userId === fanId;
  const blockedReason = click.suspicious ? "suspicious" : self ? "self_referral" : null;
  const expiresAt = new Date(click.createdAt.getTime() + windowMs);
  if (click.attribution) {
    await database.attribution.update({
      where: { id: click.attribution.id },
      data: {
        fanId: blockedReason ? click.attribution.fanId : fanId,
        expiresAt,
        blockedReason: blockedReason ?? click.attribution.blockedReason,
      },
    });
  } else {
    try {
      await database.attribution.create({
        data: { clickId: click.id, fanId: blockedReason ? null : fanId, expiresAt, blockedReason },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }
  }
  if (!blockedReason) {
    await database.user.update({ where: { id: fanId }, data: { referredClickId: click.id } });
  }
  return { clickId: click.id, blockedReason };
}

export async function affiliateRateBps(affiliateId: string, creatorId: string, fallbackBps: number) {
  const [affiliate, assignment] = await Promise.all([
    database.affiliate.findUnique({ where: { id: affiliateId }, select: { commissionBps: true } }),
    database.affiliateAssignment.findUnique({
      where: { affiliateId_creatorId: { affiliateId, creatorId } },
      select: { commissionBps: true },
    }),
  ]);
  if (assignment?.commissionBps != null) return assignment.commissionBps;
  if (affiliate) return affiliate.commissionBps;
  return fallbackBps;
}

export async function affiliateSummary(affiliateId: string) {
  const [clicks, signups, conversions, commissions] = await Promise.all([
    database.click.count({ where: { link: { affiliateId } } }),
    database.attribution.count({ where: { fanId: { not: null }, click: { link: { affiliateId } } } }),
    database.conversion.findMany({
      where: { attribution: { click: { link: { affiliateId } } } },
      select: { amountCents: true, currency: true, kind: true },
    }),
    database.commission.findMany({
      where: { affiliateId },
      select: { amountCents: true, currency: true, status: true },
    }),
  ]);
  const currencies = new Set<string>([...conversions.map((row) => row.currency), ...commissions.map((row) => row.currency)]);
  const money = Array.from(currencies).map((currency) => ({
    currency,
    salesCents: conversions.filter((row) => row.currency === currency).reduce((sum, row) => sum + row.amountCents, 0),
    purchases: conversions.filter((row) => row.currency === currency).length,
    commissionOwedCents: commissions
      .filter((row) => row.currency === currency && (row.status === "PENDING" || row.status === "APPROVED"))
      .reduce((sum, row) => sum + row.amountCents, 0),
    commissionReversedCents: commissions
      .filter((row) => row.currency === currency && row.status === "REJECTED")
      .reduce((sum, row) => sum + row.amountCents, 0),
  }));
  return { clicks, signups, purchases: conversions.length, money };
}

export async function affiliateDashboard(affiliateId: string, now = new Date()) {
  const summary = await affiliateSummary(affiliateId);
  const [clicks, commissions, links] = await Promise.all([
    database.click.findMany({
      where: { link: { affiliateId } },
      select: { createdAt: true, linkId: true },
    }),
    database.commission.findMany({
      where: { affiliateId },
      include: {
        conversion: { include: { attribution: { include: { click: { include: { link: true } } } }, purchase: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    database.affiliateLink.findMany({
      where: { affiliateId },
      include: { creator: { include: { user: { include: { profile: true } } } }, clicks: { select: { id: true } } },
    }),
  ]);
  const ledger = commissions.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    amountCents: row.amountCents,
    currency: row.currency,
    status: presentCommissionStatus(row.status, row.holdUntil, now) satisfies LedgerStatus,
    kind: row.conversion.kind,
    linkCode: row.conversion.attribution.click.link.code,
    saleCents: row.conversion.amountCents,
  }));
  const earningRows = commissions
    .filter((row) => row.status !== "REJECTED")
    .map((row) => ({ at: row.createdAt, amountCents: row.amountCents }));
  const conversionDates = commissions.filter((row) => row.status !== "REJECTED").map((row) => row.createdAt);
  const linkStats = links.map((link) => {
    const conversions = commissions.filter(
      (row) => row.status !== "REJECTED" && row.conversion.attribution.click.linkId === link.id,
    ).length;
    return {
      code: link.code,
      path: `/r/${link.code}`,
      username: link.creator.user.profile?.username ?? "",
      name: link.creator.user.profile?.name ?? "",
      clicks: link.clicks.length,
      conversions,
      conversionRate: conversionRate(link.clicks.length, conversions),
    };
  });
  return {
    summary,
    ledger,
    links: linkStats,
    daily: progressionSeries({
      clicks: clicks.map((row) => row.createdAt),
      conversions: conversionDates,
      earnings: earningRows,
    }, "day", now),
    monthly: progressionSeries({
      clicks: clicks.map((row) => row.createdAt),
      conversions: conversionDates,
      earnings: earningRows,
    }, "month", now),
  };
}

export async function markCommissionPaid(commissionId: string) {
  const current = await database.commission.findUnique({ where: { id: commissionId } });
  if (!current) return null;
  if (current.status === "REJECTED") return { error: "reversed" as const, commission: current };
  if (current.status === "PAID") return { error: null, commission: current };
  const commission = await database.commission.update({
    where: { id: commissionId },
    data: { status: "PAID" },
  });
  return { error: null, commission };
}
