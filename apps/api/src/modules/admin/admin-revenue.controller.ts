import { apiError } from "../../http/api-error";
import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { database } from "@mimelux/db/runtime";
import { z } from "zod";
import { requireUser } from "../auth/require-user";

const settingsSchema = z.object({
  creatorSharePercent: z.number().int().min(0).max(100),
  affiliateCommissionPercent: z.number().int().min(0).max(100),
});

const creatorSchema = z.object({
  ownership: z.enum(["HOUSE", "INDEPENDENT"]).optional(),
  creatorSharePercent: z.number().int().min(0).max(100).nullable().optional(),
  affiliateCommissionPercent: z.number().int().min(0).max(100).nullable().optional(),
});

async function requireAdmin(authorization?: string) {
  const user = await requireUser(authorization);
  if (user.role !== "ADMIN") throw apiError(403, "ADMIN_ONLY", "Admin only");
  return user;
}

function percent(bps: number) {
  return bps / 100;
}

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
export class AdminRevenueController {
  @Get("settings")
  async getSettings(@Headers("authorization") authorization: string | undefined) {
    await requireAdmin(authorization);
    const settings = await database.platformSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default", creatorShareBps: 8000, affiliateCommissionBps: 2000 },
    });
    return {
      creatorSharePercent: percent(settings.creatorShareBps),
      affiliateCommissionPercent: percent(settings.affiliateCommissionBps),
      creatorShareBps: settings.creatorShareBps,
      affiliateCommissionBps: settings.affiliateCommissionBps,
    };
  }

  @Patch("settings")
  async updateSettings(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actor = await requireAdmin(authorization);
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    if (parsed.data.affiliateCommissionPercent > parsed.data.creatorSharePercent) {
      throw apiError(400, "AFFILIATE_COMMISSION_CANNOT_EXCEED_THE_CREATOR_SHARE", "Affiliate commission cannot exceed the creator share");
    }
    const settings = await database.platformSettings.upsert({
      where: { id: "default" },
      update: {
        creatorShareBps: parsed.data.creatorSharePercent * 100,
        affiliateCommissionBps: parsed.data.affiliateCommissionPercent * 100,
      },
      create: {
        id: "default",
        creatorShareBps: parsed.data.creatorSharePercent * 100,
        affiliateCommissionBps: parsed.data.affiliateCommissionPercent * 100,
      },
    });
    await database.auditLog.create({
      data: {
        actorId: actor.id,
        action: "settings.revenue",
        entityType: "platform_settings",
        entityId: settings.id,
        metadata: parsed.data,
      },
    });
    return {
      creatorSharePercent: percent(settings.creatorShareBps),
      affiliateCommissionPercent: percent(settings.affiliateCommissionBps),
    };
  }

  @Get("creators")
  async creators(@Headers("authorization") authorization: string | undefined, @Query("q") q?: string) {
    await requireAdmin(authorization);
    const query = q?.trim();
    const creators = await database.creator.findMany({
      where: query
        ? {
            user: {
              profile: {
                is: {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { username: { contains: query, mode: "insensitive" } },
                  ],
                },
              },
            },
          }
        : {},
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return {
      creators: creators.map((creator) => ({
        id: creator.id,
        name: creator.user.profile?.name ?? "",
        username: creator.user.profile?.username ?? "",
        ownership: creator.ownership,
        creatorSharePercent: creator.creatorShareBps === null ? null : percent(creator.creatorShareBps),
        affiliateCommissionPercent: creator.affiliateCommissionBps === null ? null : percent(creator.affiliateCommissionBps),
      })),
    };
  }

  @Patch("creators/:id")
  async updateCreator(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const actor = await requireAdmin(authorization);
    const parsed = creatorSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    const current = await database.creator.findUnique({ where: { id } });
    if (!current) throw apiError(400, "CREATOR_NOT_FOUND", "Creator not found");
    const settings = await database.platformSettings.findUnique({ where: { id: "default" } });
    const creatorBps =
      parsed.data.creatorSharePercent === undefined
        ? current.creatorShareBps
        : parsed.data.creatorSharePercent === null
          ? null
          : parsed.data.creatorSharePercent * 100;
    const affiliateBps =
      parsed.data.affiliateCommissionPercent === undefined
        ? current.affiliateCommissionBps
        : parsed.data.affiliateCommissionPercent === null
          ? null
          : parsed.data.affiliateCommissionPercent * 100;
    const effectiveCreator = creatorBps ?? settings?.creatorShareBps ?? 8000;
    const effectiveAffiliate = affiliateBps ?? settings?.affiliateCommissionBps ?? 2000;
    if (effectiveAffiliate > effectiveCreator) {
      throw apiError(400, "AFFILIATE_COMMISSION_CANNOT_EXCEED_THE_CREATOR_SHARE", "Affiliate commission cannot exceed the creator share");
    }
    const creator = await database.creator.update({
      where: { id },
      data: {
        ownership: parsed.data.ownership,
        creatorShareBps: creatorBps,
        affiliateCommissionBps: affiliateBps,
      },
      include: { user: { include: { profile: true } } },
    });
    await database.auditLog.create({
      data: {
        actorId: actor.id,
        action: "creator.revenue",
        entityType: "creator",
        entityId: creator.id,
        metadata: {
          ownership: creator.ownership,
          creatorShareBps: creator.creatorShareBps,
          affiliateCommissionBps: creator.affiliateCommissionBps,
        },
      },
    });
    return {
      creator: {
        id: creator.id,
        name: creator.user.profile?.name ?? "",
        username: creator.user.profile?.username ?? "",
        ownership: creator.ownership,
        creatorSharePercent: creator.creatorShareBps === null ? null : percent(creator.creatorShareBps),
        affiliateCommissionPercent: creator.affiliateCommissionBps === null ? null : percent(creator.affiliateCommissionBps),
      },
    };
  }
}
