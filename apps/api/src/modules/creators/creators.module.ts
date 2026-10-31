import { apiError } from "../../http/api-error";
import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Module, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { centsForCurrency, currencyForVisitor } from "@mimelux/core/currency";
import { planChargeCents } from "@mimelux/core/monetization";
import { Prisma, database } from "@mimelux/db/runtime";
import { z } from "zod";
import { assertOwnsCreator } from "../access/creator-scope";
import { requireUser } from "../auth/require-user";
import { loadCreatorOffers } from "./catalog";

const discoveryQuerySchema = z.object({
  search: z.string().max(80).optional(),
  category: z.string().max(40).optional(),
  cursor: z.string().max(120).optional(),
});

const profileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  username: z.string().min(2).max(40).optional(),
  bio: z.string().max(500).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
});

const planFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  priceCents: z.number().int().positive().max(10_000_000),
  durationMonths: z.number().int().min(1).max(36),
  discountPercent: z.number().int().min(0).max(95).optional(),
  active: z.boolean().optional(),
};

const planCreateSchema = z.object(planFields);
const planPatchSchema = z.object({
  name: planFields.name.optional(),
  description: planFields.description,
  priceCents: planFields.priceCents.optional(),
  durationMonths: planFields.durationMonths.optional(),
  discountPercent: planFields.discountPercent,
  active: planFields.active,
}).refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

type Actor = { id: string; role: string };

function presentPlan(plan: {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  durationMonths: number;
  discountPercent: number;
  active: boolean;
}) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    durationMonths: plan.durationMonths,
    discountPercent: plan.discountPercent,
    active: plan.active,
    chargeCents: planChargeCents(plan),
  };
}

async function auditAdmin(actor: Actor, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  if (actor.role !== "ADMIN") return;
  await database.auditLog.create({
    data: {
      actorId: actor.id,
      action,
      entityType,
      entityId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

async function assertDurationAvailable(creatorId: string, durationMonths: number, exceptPlanId?: string) {
  const clash = await database.plan.findFirst({
    where: {
      creatorId,
      durationMonths,
      active: true,
      ...(exceptPlanId ? { id: { not: exceptPlanId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw apiError(400, "AN_ACTIVE_PLAN_ALREADY_USES_THIS_DURATION", "An active plan already uses this duration");
}

@ApiTags("creators")
@Controller("creators")
class CreatorsController {
  private readonly includeDemo = process.env.DEMO_MODE !== "false";

  @Get()
  @ApiOperation({ summary: "List creators" })
  async list(@Query() query: unknown) {
    const parsed = discoveryQuerySchema.parse(query);
    const creators = await database.creator.findMany({
      where: {
        ...(this.includeDemo ? {} : { isDemo: false }),
        status: "ACTIVE",
        ...(parsed.category ? { category: { equals: parsed.category, mode: "insensitive" } } : {}),
        user: parsed.search
          ? {
              deletedAt: null,
              profile: {
                is: {
                  OR: [
                    { name: { contains: parsed.search, mode: "insensitive" } },
                    { username: { contains: parsed.search, mode: "insensitive" } },
                  ],
                },
              },
            }
          : { deletedAt: null },
      },
      include: {
        user: { include: { profile: true } },
        plans: { where: { active: true } },
        posts: { where: { deletedAt: null }, select: { likeCount: true } },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    return { items: creators.map(this.present), nextCursor: null, source: "postgres" };
  }

  @Get("ranking")
  @ApiOperation({ summary: "List ranked creators" })
  async ranking() {
    return this.list({});
  }

  @Get("packs/featured")
  @ApiOperation({ summary: "List active content packs for the home page" })
  async featuredPacks(
    @Headers("cf-ipcountry") country?: string,
    @Headers("x-patrocino-locale") locale?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    const currency = currencyForVisitor({ country, locale, acceptLanguage });
    const packs = await database.contentPack.findMany({
      where: { active: true, isDemo: false, creator: { status: "ACTIVE" } },
      include: { creator: { include: { user: { include: { profile: true } } } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "asc" },
      take: 24,
    });
    return {
      currency,
      items: packs
        .filter((pack) => pack.creator.user.profile?.username)
        .map((pack) => ({
          id: pack.id,
          name: pack.name,
          priceCents: centsForCurrency(currency, pack.priceCents, pack.priceCentsUsd),
          itemCount: pack._count.items,
          username: pack.creator.user.profile!.username,
          creatorName: pack.creator.user.profile!.name,
          avatarUrl: pack.creator.user.profile!.avatarUrl ?? "",
        })),
    };
  }

  @Get(":id/profile")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read the profile a creator or admin is allowed to edit" })
  async managedProfile(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const user = await requireUser(authorization);
    const creator = await this.scopedCreator(user, id);
    return { profile: this.presentProfile(creator) };
  }

  @Patch(":id/profile")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a creator profile when the caller owns that creator" })
  async updateProfile(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const user = await requireUser(authorization);
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    const creator = await this.scopedCreator(user, id);
    const input = parsed.data;
    try {
      await database.profile.upsert({
        where: { userId: creator.userId },
        update: {
          name: input.name,
          username: input.username,
          bio: input.bio,
          city: input.city,
        },
        create: {
          userId: creator.userId,
          name: input.name ?? creator.user.email,
          username: input.username ?? `user-${creator.id.slice(-8)}`,
          bio: input.bio ?? null,
          city: input.city ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw apiError(400, "USERNAME_ALREADY_TAKEN", "Username already taken");
      }
      throw error;
    }
    const fresh = await database.creator.findUniqueOrThrow({
      where: { id: creator.id },
      include: { user: { include: { profile: true } } },
    });
    await auditAdmin(user, "creator.profile", "creator", creator.id, {
      creatorId: creator.id,
      fields: Object.keys(input),
    });
    return { profile: this.presentProfile(fresh) };
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read the signed-in creator studio" })
  async me(@Headers("authorization") authorization: string | undefined) {
    const user = await requireUser(authorization);
    if (user.role !== "CREATOR") throw apiError(403, "CREATOR_ONLY", "Creator only");
    const creator = await this.ensureOwnCreator(user.id);
    return this.studio(creator.id);
  }

  @Get(":id/plans")
  @ApiBearerAuth()
  @ApiOperation({ summary: "List plans the caller can edit for a creator" })
  async plans(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const user = await requireUser(authorization);
    const creator = await this.scopedCreator(user, id);
    return this.studio(creator.id);
  }

  @Post(":id/plans")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a subscription plan for a creator" })
  async createPlan(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const user = await requireUser(authorization);
    const parsed = planCreateSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    const creator = await this.scopedCreator(user, id);
    const input = parsed.data;
    if (input.active !== false) await assertDurationAvailable(creator.id, input.durationMonths);
    const plan = await database.plan.create({
      data: {
        creatorId: creator.id,
        name: input.name,
        description: input.description ?? "",
        priceCents: input.priceCents,
        durationMonths: input.durationMonths,
        discountPercent: input.discountPercent ?? 0,
        active: input.active !== false,
      },
    });
    await auditAdmin(user, "plan.create", "plan", plan.id, {
      creatorId: creator.id,
      priceCents: plan.priceCents,
      durationMonths: plan.durationMonths,
    });
    return { plan: presentPlan(plan) };
  }

  @Patch(":id/plans/:planId")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update or disable a subscription plan" })
  async updatePlan(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Param("planId") planId: string,
    @Body() body: unknown,
  ) {
    const user = await requireUser(authorization);
    const parsed = planPatchSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    const creator = await this.scopedCreator(user, id);
    const current = await database.plan.findFirst({ where: { id: planId, creatorId: creator.id } });
    if (!current) throw apiError(400, "PLAN_NOT_FOUND", "Plan not found");
    const input = parsed.data;
    const nextActive = input.active ?? current.active;
    const nextDuration = input.durationMonths ?? current.durationMonths;
    if (nextActive) await assertDurationAvailable(creator.id, nextDuration, current.id);
    const plan = await database.plan.update({
      where: { id: current.id },
      data: {
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        durationMonths: input.durationMonths,
        discountPercent: input.discountPercent,
        active: input.active,
        ...(input.priceCents !== undefined || input.discountPercent !== undefined || input.durationMonths !== undefined
          ? { stripePriceId: null }
          : {}),
      },
    });
    const action = input.active === false ? "plan.disable" : "plan.update";
    await auditAdmin(user, action, "plan", plan.id, {
      creatorId: creator.id,
      priceCents: plan.priceCents,
      durationMonths: plan.durationMonths,
      active: plan.active,
    });
    return { plan: presentPlan(plan) };
  }

  @Get(":username")
  @ApiOperation({ summary: "Get a creator profile" })
  async get(
    @Param("username") username: string,
    @Headers("cf-ipcountry") country?: string,
    @Headers("x-patrocino-locale") locale?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return loadCreatorOffers(username, currencyForVisitor({ country, locale, acceptLanguage }));
  }

  private async scopedCreator(
    user: { id: string; role: string },
    creatorId: string,
  ) {
    const creator = await database.creator.findUnique({
      where: { id: creatorId },
      include: { user: { include: { profile: true } } },
    });
    if (!creator) throw apiError(400, "CREATOR_NOT_FOUND", "Creator not found");
    await assertOwnsCreator(user, creator.id);
    return creator;
  }

  private async ensureOwnCreator(userId: string) {
    const existing = await database.creator.findUnique({ where: { userId } });
    if (existing) return existing;
    return database.creator.create({
      data: { userId, status: "ACTIVE", category: "Geral", ownership: "HOUSE" },
    });
  }

  private async studio(creatorId: string) {
    const creator = await database.creator.findUniqueOrThrow({
      where: { id: creatorId },
      include: {
        user: { include: { profile: true } },
        plans: { orderBy: [{ durationMonths: "asc" }, { createdAt: "asc" }] },
      },
    });
    return {
      creatorId: creator.id,
      profile: this.presentProfile(creator),
      plans: creator.plans.map(presentPlan),
    };
  }

  private presentProfile(creator: {
    id: string;
    user: { profile: { name: string; username: string; bio: string | null; city: string | null } | null };
  }) {
    return {
      id: creator.id,
      name: creator.user.profile?.name ?? "",
      username: creator.user.profile?.username ?? "",
      bio: creator.user.profile?.bio ?? "",
      city: creator.user.profile?.city ?? "",
    };
  }

  private present(creator: {
    id: string;
    category: string;
    aiGenerated: boolean;
    fictitious: boolean;
    user: { profile: { name: string; username: string; bio: string | null; city: string | null; avatarUrl: string | null; coverUrl: string | null } | null };
    plans: { id: string; name: string; description: string; priceCents: number; durationMonths: number; discountPercent: number; active: boolean }[];
    posts?: { likeCount: number }[];
  }) {
    const profile = creator.user.profile;
    return {
      id: creator.id,
      name: profile?.name ?? "Creator",
      username: profile?.username ?? creator.id,
      bio: profile?.bio ?? "",
      city: profile?.city ?? "",
      avatarUrl: profile?.avatarUrl ?? "",
      coverUrl: profile?.coverUrl ?? "",
      category: creator.category,
      verified: true,
      isFree: (creator.plans[0]?.priceCents ?? 0) === 0,
      monthlyPriceCents: creator.plans.find((plan) => plan.durationMonths === 1)?.priceCents ?? 0,
      plans: creator.plans.map(presentPlan),
      subscriberCount: 0,
      postCount: creator.posts?.length ?? 0,
      likeCount: creator.posts?.reduce((total, post) => total + post.likeCount, 0) ?? 0,
      aiGenerated: creator.aiGenerated,
      fictitious: creator.fictitious,
    };
  }
}

@Module({ controllers: [CreatorsController] })
export class CreatorsModule {}
