import { apiError } from "../../http/api-error";
import { Body, Controller, Delete, Get, Headers, Module, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { database } from "@mimelux/db/runtime";
import { requireUser } from "../auth/require-user";
import { resolveClientIp } from "../auth/client-ip";
import { affiliateLinkPath, opaqueLinkCode } from "@mimelux/core/currency";
import { affiliateDashboard, recordAffiliateClick } from "./tracking";

const createLinkSchema = z.object({
  creatorId: z.string().trim().min(2).max(80),
  packId: z.string().trim().min(2).max(80).optional().nullable(),
  label: z.string().trim().max(40).optional().nullable(),
});

/** Self-service limits: enough for real promotion, not for spraying codes. */
const LINKS_PER_HOUR = 20;
const ACTIVE_LINKS_MAX = 200;

async function ownAffiliate(authorization: string | undefined) {
  const user = await requireUser(authorization);
  const affiliate = await database.affiliate.findUnique({ where: { userId: user.id } });
  if (!affiliate) throw apiError(404, "AFFILIATE_NOT_FOUND", "Affiliate not found");
  return affiliate;
}

const clickSchema = z.object({
  code: z.string().trim().min(2).max(80),
  subId: z.string().trim().max(40).optional(),
  locale: z.string().trim().max(12).optional(),
  creator: z.string().trim().max(80).optional(),
  exact: z.boolean().optional(),
});

@ApiTags("affiliates")
@Controller()
export class AffiliatesController {
  @Post("affiliate/clicks")
  async click(@Body() body: unknown, @Req() request: Request) {
    const parsed = clickSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_CLICK", "Invalid click");
    const recorded = await recordAffiliateClick({
      code: parsed.data.code,
      subId: parsed.data.subId,
      locale: parsed.data.locale,
      creator: parsed.data.creator,
      exact: parsed.data.exact,
      ip: resolveClientIp(request),
      userAgent: request.header("user-agent"),
    });
    if (!recorded) throw apiError(404, "LINK_NOT_FOUND", "Link not found");
    return recorded;
  }

  @Get("affiliate/me")
  async me(@Headers("authorization") authorization?: string) {
    const user = await requireUser(authorization);
    const affiliate = await database.affiliate.findUnique({
      where: { userId: user.id },
      include: {
        links: {
          where: { active: true },
          include: { creator: { include: { user: { include: { profile: true } } } } },
        },
      },
    });
    if (!affiliate) throw apiError(404, "AFFILIATE_NOT_FOUND", "Affiliate not found");
    const dashboard = await affiliateDashboard(affiliate.id);
    return {
      id: affiliate.id,
      name: affiliate.displayName,
      commissionPercent: affiliate.commissionBps / 100,
      ...dashboard,
    };
  }
}

@ApiTags("affiliates")
@Controller()
export class AffiliateSelfLinksController {
  /** Active creators and their active packs an affiliate can promote. Read-only. */
  @Get("affiliate/catalog")
  async catalog(@Headers("authorization") authorization?: string) {
    await ownAffiliate(authorization);
    const creators = await database.creator.findMany({
      where: { status: "ACTIVE", isDemo: false, acceptsAffiliates: true },
      include: {
        user: { include: { profile: true } },
        contentPacks: { where: { active: true, isDemo: false }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
      },
    });
    return {
      creators: creators
        .filter((creator) => creator.user.profile?.username)
        .map((creator) => ({
          id: creator.id,
          username: creator.user.profile!.username,
          name: creator.user.profile!.name,
          packs: creator.contentPacks,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  @Post("affiliate/links")
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const affiliate = await ownAffiliate(authorization);
    if (affiliate.status !== "ACTIVE") throw apiError(403, "AFFILIATE_INACTIVE", "Affiliate is not active");
    const parsed = createLinkSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", "Invalid request");
    const creator = await database.creator.findFirst({
      where: { id: parsed.data.creatorId, status: "ACTIVE", isDemo: false, acceptsAffiliates: true },
      include: { user: { include: { profile: true } } },
    });
    const username = creator?.user.profile?.username;
    if (!creator || !username) throw apiError(404, "CREATOR_NOT_FOUND", "Creator not found");
    if (creator.userId === affiliate.userId) throw apiError(400, "SELF_REFERRAL", "You cannot promote yourself");
    let packId: string | null = null;
    if (parsed.data.packId) {
      const pack = await database.contentPack.findFirst({
        where: { id: parsed.data.packId, creatorId: creator.id, active: true, isDemo: false },
        select: { id: true },
      });
      if (!pack) throw apiError(404, "PACK_NOT_FOUND", "Pack not found");
      packId = pack.id;
    }
    const [recent, active] = await Promise.all([
      database.affiliateLink.count({ where: { affiliateId: affiliate.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } }),
      database.affiliateLink.count({ where: { affiliateId: affiliate.id, active: true } }),
    ]);
    if (recent >= LINKS_PER_HOUR || active >= ACTIVE_LINKS_MAX) throw apiError(429, "TOO_MANY_LINKS", "Too many links, try again later");
    let code = opaqueLinkCode(6);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await database.affiliateLink.findUnique({ where: { code } });
      if (!clash) break;
      code = opaqueLinkCode(6);
    }
    const created = await database.affiliateLink.create({
      data: { affiliateId: affiliate.id, creatorId: creator.id, packId, label: parsed.data.label || null, slug: username, code },
    });
    await database.auditLog
      .create({ data: { actorId: affiliate.userId, action: "affiliate.self-link", entityType: "affiliate", entityId: affiliate.id, metadata: { creatorId: creator.id, packId, code } } })
      .catch(() => undefined);
    return { code: created.code, path: affiliateLinkPath(username, created.code), packId };
  }

  /** Deactivates one of the caller's own links. Clicks and commissions stay on record. */
  @Delete("affiliate/links/:code")
  async remove(@Headers("authorization") authorization: string | undefined, @Param("code") code: string) {
    const affiliate = await ownAffiliate(authorization);
    const result = await database.affiliateLink.updateMany({ where: { affiliateId: affiliate.id, code, active: true }, data: { active: false } });
    if (!result.count) throw apiError(404, "LINK_NOT_FOUND", "Link not found");
    return { removed: true };
  }
}

@Module({ controllers: [AffiliatesController, AffiliateSelfLinksController] })
export class AffiliatesModule {}
