import { affiliateLinkPath, opaqueLinkCode } from "@mimelux/core/currency";
import { apiError } from "../../http/api-error";
import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Prisma, database } from "@mimelux/db/runtime";
import {
  catalogDefaults,
  monthlyPriceAllowed,
  videoPriceAllowed,
  type ChargeCurrency,
} from "@mimelux/core/currency";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { verify } from "jsonwebtoken";
import { z } from "zod";
import { affiliateDashboard, affiliateSummary, markCommissionPaid } from "../affiliates/tracking";

const whole = z.number().int().positive();

const affiliateCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email(),
  commissionPercent: z.number().min(0).max(100),
  creatorIds: z.array(z.string().min(1)).max(500).optional(),
});

const affiliatePatchSchema = z.object({
  email: z.email().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
});

const assignmentSchema = z.object({
  creatorId: z.string().min(1),
  commissionPercent: z.number().min(0).max(100).nullable().optional(),
});

const linkSchema = z.object({
  creatorId: z.string().min(1),
});

const packSchema = z.object({
  creatorId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  priceCentsBrl: whole.optional(),
  priceCentsUsd: whole.optional(),
  postIds: z.array(z.string().min(1)).max(200).default([]),
  active: z.boolean().optional(),
});

const packPatchSchema = packSchema.partial().omit({ creatorId: true });

const pricesSchema = z.object({
  creatorId: z.string().min(1),
  monthlyBrlCents: whole,
  monthlyUsdCents: whole,
  videoBrlCents: whole,
  videoUsdCents: whole,
  guestVideoBrlCents: whole,
  guestVideoUsdCents: whole,
  applyToVideos: z.boolean().optional(),
});

const packDefaultSchema = z.object({
  priceCentsBrl: whole,
  priceCentsUsd: whole,
});

function requireAdmin(authorization?: string) {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw apiError(401, "MISSING_ACCESS_TOKEN", "Missing access token");
  try {
    const payload = verify(token, process.env.JWT_ACCESS_SECRET ?? "local-access-only") as { sub?: string; role?: string };
    if (!payload.sub || payload.role !== "ADMIN") throw apiError(403, "ADMIN_ONLY", "Admin only");
    return payload.sub;
  } catch (error) {
    if (error && typeof error === "object" && "getStatus" in error) throw error;
    throw apiError(401, "INVALID_ACCESS_TOKEN", "Invalid access token");
  }
}

function bps(percent: number) {
  const value = Math.round(percent * 100);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw apiError(400, "INVALID_COMMISSION", "Invalid commission");
  }
  return value;
}

function moneyOr(value: number | undefined, fallback: number) {
  return value ?? fallback;
}

function assertMonthly(currency: ChargeCurrency, cents: number) {
  if (!monthlyPriceAllowed(currency, cents)) throw apiError(400, "PRICE_OUT_OF_RANGE", "Price is out of range");
}

function assertVideo(currency: ChargeCurrency, cents: number) {
  if (!videoPriceAllowed(currency, cents)) throw apiError(400, "PRICE_OUT_OF_RANGE", "Price is out of range");
}

async function audit(actorId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  await database.auditLog.create({
    data: { actorId, action, entityType, entityId, metadata: metadata as Prisma.InputJsonValue },
  });
}

function linkCode() {
  return opaqueLinkCode(6);
}

@ApiTags("admin")
@ApiBearerAuth()
@Controller()
export class AdminCommerceController {
  @Get("admin/affiliates")
  async listAffiliates(@Headers("authorization") authorization?: string) {
    requireAdmin(authorization);
    const rows = await database.affiliate.findMany({
      include: {
        user: { include: { profile: true } },
        assignments: { include: { creator: { include: { user: { include: { profile: true } } } } } },
        links: { where: { active: true }, include: { creator: { include: { user: { include: { profile: true } } } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    const items = [];
    for (const row of rows) {
      const summary = await affiliateSummary(row.id);
      items.push({
        id: row.id,
        name: row.displayName,
        email: row.user.email,
        emailPlaceholder: row.emailPlaceholder,
        code: row.code,
        commissionPercent: row.commissionBps / 100,
        status: row.status,
        summary,
        assignments: row.assignments.map((item) => ({
          creatorId: item.creatorId,
          name: item.creator.user.profile?.name ?? item.creatorId,
          username: item.creator.user.profile?.username ?? "",
          commissionPercent: item.commissionBps == null ? null : item.commissionBps / 100,
        })),
        links: row.links.map((item) => ({
          code: item.code,
          path: affiliateLinkPath(item.creator.user.profile?.username ?? item.creatorId, item.code),
          creatorId: item.creatorId,
          username: item.creator.user.profile?.username ?? "",
        })),
      });
    }
    const creators = await database.creator.findMany({
      where: { status: "ACTIVE" },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: "asc" },
    });
    return {
      affiliates: items,
      creators: creators.map((creator) => ({
        id: creator.id,
        name: creator.user.profile?.name ?? creator.id,
        username: creator.user.profile?.username ?? "",
      })),
    };
  }

  @Get("admin/affiliates/:id")
  async affiliateDetail(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    requireAdmin(authorization);
    const row = await database.affiliate.findUnique({ where: { id } });
    if (!row) throw apiError(404, "AFFILIATE_NOT_FOUND", "Affiliate not found");
    return affiliateDashboard(id);
  }

  @Post("admin/commissions/:id/paid")
  async markPaid(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const actorId = requireAdmin(authorization);
    const result = await markCommissionPaid(id);
    if (!result) throw apiError(404, "COMMISSION_NOT_FOUND", "Commission not found");
    if (result.error === "reversed") throw apiError(409, "COMMISSION_REVERSED", "Commission was reversed");
    await audit(actorId, "commission.paid", "commission", id, {});
    return { id: result.commission.id, status: "paid" };
  }

  @Post("admin/affiliates")
  async createAffiliate(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actorId = requireAdmin(authorization);
    const parsed = affiliateCreateSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", "Invalid request");
    const email = parsed.data.email.trim().toLowerCase();
    const existing = await database.user.findUnique({ where: { email }, include: { affiliate: true } });
    if (existing) {
      // An existing account (fan, creator or admin) keeps its role and login; it only gains an affiliate profile.
      if (existing.affiliate) throw apiError(409, "ALREADY_AFFILIATE", "User is already an affiliate");
      const attached = await database.affiliate.create({
        data: {
          userId: existing.id,
          code: opaqueLinkCode(8),
          displayName: parsed.data.name,
          commissionBps: bps(parsed.data.commissionPercent),
        },
      });
      for (const creatorId of parsed.data.creatorIds ?? []) {
        const creator = await database.creator.findUnique({ where: { id: creatorId } });
        if (!creator) continue;
        await database.affiliateAssignment.create({ data: { affiliateId: attached.id, creatorId } });
      }
      await audit(actorId, "affiliate.attach", "affiliate", attached.id, { userId: existing.id });
      return { id: attached.id, temporaryPassword: null, existingUser: true };
    }
    const temporaryPassword = randomBytes(9).toString("base64url");
    const code = opaqueLinkCode(8);
    const user = await database.user.create({
      data: {
        email,
        passwordHash: await hash(temporaryPassword, 12),
        role: "AFFILIATE",
        emailVerifiedAt: new Date(),
        mustResetPassword: true,
        profile: { create: { name: parsed.data.name, username: `af-${code}` } },
        affiliate: {
          create: {
            code,
            displayName: parsed.data.name,
            commissionBps: bps(parsed.data.commissionPercent),
          },
        },
      },
      include: { affiliate: true },
    });
    const affiliate = user.affiliate!;
    for (const creatorId of parsed.data.creatorIds ?? []) {
      const creator = await database.creator.findUnique({ where: { id: creatorId } });
      if (!creator) continue;
      await database.affiliateAssignment.create({ data: { affiliateId: affiliate.id, creatorId } });
    }
    await audit(actorId, "affiliate.create", "affiliate", affiliate.id, { email });
    return { id: affiliate.id, temporaryPassword };
  }

  @Patch("admin/affiliates/:id")
  async patchAffiliate(@Param("id") id: string, @Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actorId = requireAdmin(authorization);
    const parsed = affiliatePatchSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", "Invalid request");
    const current = await database.affiliate.findUnique({ where: { id }, include: { user: true } });
    if (!current) throw apiError(404, "AFFILIATE_NOT_FOUND", "Affiliate not found");
    let email = current.user.email;
    let emailPlaceholder = current.emailPlaceholder;
    if (parsed.data.email) {
      email = parsed.data.email.trim().toLowerCase();
      if (email !== current.user.email) {
        const taken = await database.user.findUnique({ where: { email } });
        if (taken && taken.id !== current.userId) throw apiError(409, "EMAIL_ALREADY_REGISTERED", "Email already registered");
        await database.user.update({ where: { id: current.userId }, data: { email } });
        emailPlaceholder = false;
      }
    }
    const saved = await database.affiliate.update({
      where: { id },
      data: {
        emailPlaceholder,
        ...(parsed.data.commissionPercent != null ? { commissionBps: bps(parsed.data.commissionPercent) } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}),
      },
    });
    await audit(actorId, "affiliate.update", "affiliate", id, { commissionBps: saved.commissionBps, emailPlaceholder });
    return {
      id: saved.id,
      email,
      emailPlaceholder: saved.emailPlaceholder,
      commissionPercent: saved.commissionBps / 100,
      status: saved.status,
    };
  }

  @Post("admin/affiliates/:id/assignments")
  async assign(@Param("id") id: string, @Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actorId = requireAdmin(authorization);
    const parsed = assignmentSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", "Invalid request");
    const affiliate = await database.affiliate.findUnique({ where: { id } });
    const creator = await database.creator.findUnique({ where: { id: parsed.data.creatorId } });
    if (!affiliate || !creator) throw apiError(404, "NOT_FOUND", "Not found");
    const commissionBps = parsed.data.commissionPercent == null ? null : bps(parsed.data.commissionPercent);
    await database.affiliateAssignment.upsert({
      where: { affiliateId_creatorId: { affiliateId: id, creatorId: creator.id } },
      create: { affiliateId: id, creatorId: creator.id, commissionBps },
      update: { commissionBps },
    });
    await audit(actorId, "affiliate.assign", "affiliate", id, { creatorId: creator.id, commissionBps });
    return { assigned: true };
  }

  @Delete("admin/affiliates/:id/assignments/:creatorId")
  async unassign(
    @Param("id") id: string,
    @Param("creatorId") creatorId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const actorId = requireAdmin(authorization);
    await database.affiliateAssignment.deleteMany({ where: { affiliateId: id, creatorId } });
    await database.affiliateLink.updateMany({ where: { affiliateId: id, creatorId }, data: { active: false } });
    await audit(actorId, "affiliate.unassign", "affiliate", id, { creatorId });
    return { assigned: false };
  }

  @Post("admin/affiliates/:id/links")
  async link(@Param("id") id: string, @Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actorId = requireAdmin(authorization);
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", "Invalid request");
    const affiliate = await database.affiliate.findUnique({ where: { id } });
    const creator = await database.creator.findUnique({
      where: { id: parsed.data.creatorId },
      include: { user: { include: { profile: true } } },
    });
    if (!affiliate || !creator) throw apiError(404, "NOT_FOUND", "Not found");
    const assigned = await database.affiliateAssignment.findUnique({
      where: { affiliateId_creatorId: { affiliateId: id, creatorId: creator.id } },
    });
    if (!assigned) throw apiError(400, "CREATOR_IS_NOT_ASSIGNED", "Creator is not assigned");
    const existing = await database.affiliateLink.findUnique({
      where: { affiliateId_creatorId: { affiliateId: id, creatorId: creator.id } },
    });
    if (existing) {
      const saved = existing.active ? existing : await database.affiliateLink.update({ where: { id: existing.id }, data: { active: true } });
      return { code: saved.code, path: affiliateLinkPath(creator.user.profile?.username ?? creator.id, saved.code) };
    }
    let code = linkCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await database.affiliateLink.findUnique({ where: { code } });
      if (!clash) break;
      code = linkCode();
    }
    const username = creator.user.profile?.username ?? creator.id;
    const created = await database.affiliateLink.create({
      data: { affiliateId: id, creatorId: creator.id, slug: username, code },
    });
    await audit(actorId, "affiliate.link", "affiliate", id, { creatorId: creator.id, code });
    return { code: created.code, path: affiliateLinkPath(username, created.code) };
  }

  @Get("admin/packs")
  async listPacks(@Headers("authorization") authorization: string | undefined, @Query("creatorId") creatorId?: string) {
    requireAdmin(authorization);
    const packs = await database.contentPack.findMany({
      where: creatorId ? { creatorId } : undefined,
      include: { items: true, creator: { include: { user: { include: { profile: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return {
      packs: packs.map((pack) => ({
        id: pack.id,
        creatorId: pack.creatorId,
        creatorName: pack.creator.user.profile?.name ?? pack.creatorId,
        name: pack.name,
        description: pack.description,
        priceCentsBrl: pack.priceCents,
        priceCentsUsd: pack.priceCentsUsd,
        active: pack.active,
        postIds: pack.items.map((item) => item.postId),
      })),
    };
  }

  @Post("admin/packs")
  async createPack(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actorId = requireAdmin(authorization);
    const parsed = packSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", "Invalid request");
    const creator = await database.creator.findUnique({ where: { id: parsed.data.creatorId } });
    if (!creator) throw apiError(404, "CREATOR_NOT_FOUND", "Creator not found");
    const settings = await database.platformSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
    const priceCents = moneyOr(parsed.data.priceCentsBrl, settings.defaultPackPriceCentsBrl);
    const priceCentsUsd = moneyOr(parsed.data.priceCentsUsd, settings.defaultPackPriceCentsUsd);
    if (priceCents % 100 !== 0 || priceCentsUsd % 100 !== 0) throw apiError(400, "PRICE_OUT_OF_RANGE", "Price is out of range");
    const posts = await database.post.findMany({
      where: { id: { in: parsed.data.postIds }, creatorId: creator.id, deletedAt: null },
      select: { id: true },
    });
    const pack = await database.contentPack.create({
      data: {
        creatorId: creator.id,
        name: parsed.data.name,
        description: parsed.data.description ?? "",
        priceCents,
        priceCentsUsd,
        active: parsed.data.active ?? true,
        items: { create: posts.map((post) => ({ postId: post.id })) },
      },
    });
    await audit(actorId, "pack.create", "content_pack", pack.id, { creatorId: creator.id, priceCents, priceCentsUsd });
    return { id: pack.id };
  }

  @Patch("admin/packs/:id")
  async patchPack(@Param("id") id: string, @Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actorId = requireAdmin(authorization);
    const parsed = packPatchSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", "Invalid request");
    const current = await database.contentPack.findUnique({ where: { id } });
    if (!current) throw apiError(404, "PACK_NOT_FOUND", "Pack not found");
    if (parsed.data.priceCentsBrl != null && parsed.data.priceCentsBrl % 100 !== 0) {
      throw apiError(400, "PRICE_OUT_OF_RANGE", "Price is out of range");
    }
    if (parsed.data.priceCentsUsd != null && parsed.data.priceCentsUsd % 100 !== 0) {
      throw apiError(400, "PRICE_OUT_OF_RANGE", "Price is out of range");
    }
    await database.contentPack.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.description != null ? { description: parsed.data.description } : {}),
        ...(parsed.data.priceCentsBrl != null ? { priceCents: parsed.data.priceCentsBrl } : {}),
        ...(parsed.data.priceCentsUsd != null ? { priceCentsUsd: parsed.data.priceCentsUsd } : {}),
        ...(parsed.data.active != null ? { active: parsed.data.active } : {}),
      },
    });
    if (parsed.data.postIds) {
      const posts = await database.post.findMany({
        where: { id: { in: parsed.data.postIds }, creatorId: current.creatorId, deletedAt: null },
        select: { id: true },
      });
      await database.contentPackItem.deleteMany({ where: { packId: id } });
      if (posts.length) {
        await database.contentPackItem.createMany({ data: posts.map((post) => ({ packId: id, postId: post.id })) });
      }
    }
    await audit(actorId, "pack.update", "content_pack", id, {});
    return { id };
  }

  @Delete("admin/packs/:id")
  async deletePack(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const actorId = requireAdmin(authorization);
    await database.contentPack.updateMany({ where: { id }, data: { active: false } });
    await audit(actorId, "pack.disable", "content_pack", id, {});
    return { active: false };
  }

  @Get("admin/catalog-prices")
  async catalog(@Headers("authorization") authorization: string | undefined, @Query("creatorId") creatorId?: string) {
    requireAdmin(authorization);
    const settings = await database.platformSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
    const creator = creatorId
      ? await database.creator.findUnique({
          where: { id: creatorId },
          include: { plans: true, user: { include: { profile: true } } },
        })
      : null;
    const monthly = creator?.plans.find((plan) => plan.durationMonths === 1) ?? null;
    return {
      packDefaults: {
        priceCentsBrl: settings.defaultPackPriceCentsBrl,
        priceCentsUsd: settings.defaultPackPriceCentsUsd,
      },
      ranges: {
        monthlyUsd: [catalogDefaults.monthlyUsdMin, catalogDefaults.monthlyUsdMax],
        monthlyBrl: [catalogDefaults.monthlyBrlMin, catalogDefaults.monthlyBrlMax],
        videoUsd: [catalogDefaults.videoUsdMin, catalogDefaults.videoUsdMax],
      },
      creator: creator
        ? {
            id: creator.id,
            name: creator.user.profile?.name ?? creator.id,
            monthlyBrlCents: monthly?.priceCents ?? catalogDefaults.monthlyBrlCents,
            monthlyUsdCents: monthly?.priceCentsUsd ?? catalogDefaults.monthlyUsdCents,
            videoBrlCents: creator.defaultVideoPriceCents,
            videoUsdCents: creator.defaultVideoPriceCentsUsd,
            guestVideoBrlCents: creator.guestVideoPriceCents ?? catalogDefaults.guestVideoBrlCents,
            guestVideoUsdCents: creator.guestVideoPriceCentsUsd ?? catalogDefaults.guestVideoUsdCents,
          }
        : null,
    };
  }

  @Patch("admin/catalog-prices")
  async saveCatalog(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actorId = requireAdmin(authorization);
    const parsed = pricesSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", "Invalid request");
    assertMonthly("BRL", parsed.data.monthlyBrlCents);
    assertMonthly("USD", parsed.data.monthlyUsdCents);
    assertVideo("BRL", parsed.data.videoBrlCents);
    assertVideo("USD", parsed.data.videoUsdCents);
    assertVideo("BRL", parsed.data.guestVideoBrlCents);
    assertVideo("USD", parsed.data.guestVideoUsdCents);
    const creator = await database.creator.findUnique({ where: { id: parsed.data.creatorId }, include: { plans: true } });
    if (!creator) throw apiError(404, "CREATOR_NOT_FOUND", "Creator not found");
    await database.creator.update({
      where: { id: creator.id },
      data: {
        defaultVideoPriceCents: parsed.data.videoBrlCents,
        defaultVideoPriceCentsUsd: parsed.data.videoUsdCents,
        guestVideoPriceCents: parsed.data.guestVideoBrlCents,
        guestVideoPriceCentsUsd: parsed.data.guestVideoUsdCents,
      },
    });
    for (const months of [1, 3, 6, 12] as const) {
      const plan = creator.plans.find((item) => item.durationMonths === months);
      if (!plan) continue;
      const discount = catalogDefaults.termDiscounts[months];
      await database.plan.update({
        where: { id: plan.id },
        data: {
          priceCents: parsed.data.monthlyBrlCents * months,
          priceCentsUsd: parsed.data.monthlyUsdCents * months,
          discountPercent: discount,
        },
      });
    }
    if (parsed.data.applyToVideos) {
      await database.post.updateMany({
        where: { creatorId: creator.id, deletedAt: null, visibility: { in: ["PPV", "SUBSCRIBER_PPV"] } },
        data: {
          priceCents: parsed.data.videoBrlCents,
          priceCentsUsd: parsed.data.videoUsdCents,
          guestPriceCents: parsed.data.guestVideoBrlCents,
          guestPriceCentsUsd: parsed.data.guestVideoUsdCents,
        },
      });
    }
    await audit(actorId, "catalog.prices", "creator", creator.id, parsed.data);
    return { saved: true };
  }

  @Patch("admin/pack-defaults")
  async packDefaults(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actorId = requireAdmin(authorization);
    const parsed = packDefaultSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", "Invalid request");
    if (parsed.data.priceCentsBrl % 100 !== 0 || parsed.data.priceCentsUsd % 100 !== 0) {
      throw apiError(400, "PRICE_OUT_OF_RANGE", "Price is out of range");
    }
    const settings = await database.platformSettings.upsert({
      where: { id: "default" },
      update: {
        defaultPackPriceCentsBrl: parsed.data.priceCentsBrl,
        defaultPackPriceCentsUsd: parsed.data.priceCentsUsd,
      },
      create: {
        id: "default",
        defaultPackPriceCentsBrl: parsed.data.priceCentsBrl,
        defaultPackPriceCentsUsd: parsed.data.priceCentsUsd,
      },
    });
    await audit(actorId, "pack.defaults", "platform_settings", settings.id, parsed.data);
    return {
      priceCentsBrl: settings.defaultPackPriceCentsBrl,
      priceCentsUsd: settings.defaultPackPriceCentsUsd,
    };
  }
}
