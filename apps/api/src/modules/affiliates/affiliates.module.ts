import { apiError } from "../../http/api-error";
import { Body, Controller, Get, Headers, Module, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { database } from "@mimelux/db/runtime";
import { requireUser } from "../auth/require-user";
import { resolveClientIp } from "../auth/client-ip";
import { affiliateDashboard, recordAffiliateClick } from "./tracking";

const clickSchema = z.object({
  code: z.string().trim().min(2).max(80),
  subId: z.string().trim().max(40).optional(),
  locale: z.string().trim().max(12).optional(),
  creator: z.string().trim().max(80).optional(),
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

@Module({ controllers: [AffiliatesController] })
export class AffiliatesModule {}
