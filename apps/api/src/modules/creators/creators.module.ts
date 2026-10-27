import { BadRequestException, Body, Controller, Get, Headers, Module, Param, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
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
        throw new BadRequestException("Username already taken");
      }
      throw error;
    }
    const fresh = await database.creator.findUniqueOrThrow({
      where: { id: creator.id },
      include: { user: { include: { profile: true } } },
    });
    return { profile: this.presentProfile(fresh) };
  }

  @Get(":username")
  @ApiOperation({ summary: "Get a creator profile" })
  async get(@Param("username") username: string) {
    return loadCreatorOffers(username);
  }

  private async scopedCreator(
    user: { id: string; role: string },
    creatorId: string,
  ) {
    const creator = await database.creator.findUnique({
      where: { id: creatorId },
      include: { user: { include: { profile: true } } },
    });
    if (!creator) throw new BadRequestException("Creator not found");
    await assertOwnsCreator(user, creator.id);
    return creator;
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
    plans: { id: string; name: string; priceCents: number; durationMonths: number; discountPercent: number }[];
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
