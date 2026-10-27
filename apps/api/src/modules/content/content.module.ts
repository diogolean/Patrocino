import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Module, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { database } from "@mimelux/db/runtime";
import { z } from "zod";
import { assertOwnsCreator, ownsCreator } from "../access/creator-scope";
import { optionalUser, requireUser } from "../auth/require-user";
import { viewerCanReadPost } from "../media/entitlement";

const createPostSchema = z.object({
  caption: z.string().min(1).max(500),
  visibility: z.enum(["free", "subscriber", "ppv", "subscriber_ppv"]),
  mediaIds: z.array(z.string()).min(1),
  priceCents: z.number().int().positive().optional(),
});

@ApiTags("content")
@Controller()
class ContentController {
  private readonly includeDemo = process.env.DEMO_MODE !== "false";

  @Get("feed")
  @ApiOperation({ summary: "Get the authenticated feed" })
  feed() {
    return { items: [], nextCursor: null, source: "api-shell" };
  }

  @Post("posts")
  @HttpCode(501)
  @ApiOperation({ summary: "Create a post (contract only in V0.1)" })
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const user = await requireUser(authorization);
    const parsed = createPostSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
    const rows = await database.media.findMany({
      where: { id: { in: parsed.data.mediaIds } },
      select: { post: { select: { creatorId: true, deletedAt: true } } },
    });
    if (rows.length !== parsed.data.mediaIds.length || rows.some((row) => !row.post || row.post.deletedAt)) {
      throw new BadRequestException("Unknown media");
    }
    const creatorIds = new Set(rows.map((row) => row.post?.creatorId).filter((id): id is string => Boolean(id)));
    if (creatorIds.size !== 1) throw new ForbiddenException("Creator only");
    await assertOwnsCreator(user, [...creatorIds][0] ?? "");
    return { input: parsed.data, code: "NOT_IMPLEMENTED" };
  }

  @Get("posts/:id")
  async get(@Param("id") id: string, @Headers("authorization") authorization: string | undefined) {
    const post = await database.post.findUnique({
      where: { id },
      include: { media: true },
    });
    if (!post || post.deletedAt) return { item: null, id, source: "api-shell" };
    const viewer = await optionalUser(authorization);
    const access = await viewerCanReadPost({
      user: viewer,
      owns: viewer ? await ownsCreator(viewer, post.creatorId) : false,
      post,
    });
    return {
      item: {
        id: post.id,
        creatorId: post.creatorId,
        caption: access ? post.caption : "",
        visibility: post.visibility,
        locked: !access,
        media: access
          ? post.media.map((item) => ({
              id: item.id,
              kind: item.kind,
              mimeType: item.mimeType,
              fileUrl: `/v1/media/${item.id}/file`,
            }))
          : [],
      },
      source: "postgres",
    };
  }

  @Get("posts/:id/comments")
  @ApiOperation({ summary: "List comments for a post" })
  async comments(@Param("id") id: string) {
    const items = await database.postComment.findMany({
      where: { postId: id, ...(this.includeDemo ? {} : { isDemo: false }) },
      orderBy: { createdAt: "asc" },
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        postId: item.postId,
        authorName: item.authorName,
        body: item.body,
      })),
      source: "postgres",
    };
  }

  @Get("reviews")
  @ApiOperation({ summary: "List subscriber reviews for a creator" })
  async reviews(@Query("creatorId") creatorId = "") {
    const items = await database.review.findMany({
      where: { creatorId, ...(this.includeDemo ? {} : { isDemo: false }) },
      orderBy: { createdAt: "asc" },
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        creatorId: item.creatorId,
        authorName: item.authorName,
        rating: item.rating,
        body: item.body,
        subscriber: item.subscriber,
      })),
      source: "postgres",
    };
  }
}

@Module({ controllers: [ContentController] })
export class ContentModule {}
