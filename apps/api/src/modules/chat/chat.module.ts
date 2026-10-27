import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Module, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { chatSequenceOfferModes } from "@mimelux/core/chat-sequence";
import { database } from "@mimelux/db/runtime";
import { z } from "zod";
import { assertOwnsCreator } from "../access/creator-scope";
import { optionalUser, requireUser } from "../auth/require-user";
import { markFanThreadRead } from "../notifications/unread";
import { ensureChatSequence, readFanThread, replaceChatSequence, type SequenceStepInput } from "./sequence";

const messageSchema = z.object({
  body: z.string().min(1).max(2000),
  mediaIds: z.array(z.string()).optional(),
  ppvPriceCents: z.number().int().positive().optional(),
});

const stepSchema = z.object({
  position: z.number().int().min(0).max(40),
  delayMinutes: z.number().int().min(0).max(60 * 24 * 90),
  bodyTemplate: z.string().trim().min(1).max(2000),
  offerMode: z.enum(chatSequenceOfferModes),
  postId: z.string().trim().min(1).nullable().optional(),
  recurring: z.boolean().optional().default(false),
});

const sequenceSchema = z.object({
  enabled: z.boolean(),
  steps: z.array(stepSchema).max(40),
});

@ApiTags("chat")
@Controller("conversations")
class ChatController {
  @Get()
  @ApiOperation({ summary: "List conversations" })
  list() {
    return { items: [], source: "api-shell" };
  }

  @Get("with/:creatorKey")
  @ApiOperation({ summary: "Read the signed-in fan thread with a creator" })
  async withCreator(@Headers("authorization") authorization: string | undefined, @Param("creatorKey") creatorKey: string) {
    const user = await optionalUser(authorization);
    if (!user) return { messages: [] };
    const thread = await readFanThread(user.id, creatorKey);
    await markFanThreadRead(user.id, creatorKey);
    return thread;
  }

  @Post("with/:creatorKey/read")
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Mark the fan thread with a creator as read" })
  async markRead(@Headers("authorization") authorization: string | undefined, @Param("creatorKey") creatorKey: string) {
    const user = await requireUser(authorization);
    return markFanThreadRead(user.id, creatorKey);
  }

  @Get(":id/messages")
  messages(@Param("id") id: string) {
    return { items: [], conversationId: id, source: "api-shell" };
  }

  @Post(":id/messages")
  @HttpCode(501)
  send(@Param("id") id: string, @Body() body: unknown) {
    return {
      code: "NOT_IMPLEMENTED",
      conversationId: id,
      input: messageSchema.parse(body),
    };
  }
}

@ApiTags("creators")
@Controller("creators")
class ChatSequenceController {
  @Get(":id/chat-sequence")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read the creator chat sequence" })
  async read(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const user = await requireUser(authorization);
    await assertOwnsCreator(user, id);
    const sequence = await ensureChatSequence(database, id);
    const videos = await database.post.findMany({
      where: { creatorId: id, deletedAt: null, priceCents: { gt: 0 }, media: { some: { kind: "VIDEO" } } },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: { id: true, caption: true, priceCents: true },
    });
    return {
      creatorId: id,
      enabled: sequence.enabled,
      steps: sequence.steps.map(presentStep),
      videos: videos.map((video) => ({ id: video.id, title: video.caption, priceCents: video.priceCents })),
    };
  }

  @Put(":id/chat-sequence")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Replace the creator chat sequence" })
  async save(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const user = await requireUser(authorization);
    await assertOwnsCreator(user, id);
    const parsed = sequenceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
    const positions = new Set(parsed.data.steps.map((step) => step.position));
    if (positions.size !== parsed.data.steps.length) throw new BadRequestException("Each step needs its own position");
    for (const step of parsed.data.steps) {
      if (step.offerMode !== "post") continue;
      if (!step.postId) throw new BadRequestException("Choose a video for this step");
      const post = await database.post.findFirst({
        where: { id: step.postId, creatorId: id, deletedAt: null, priceCents: { gt: 0 } },
        select: { id: true },
      });
      if (!post) throw new BadRequestException("That video is not on this creator");
    }
    const saved = await replaceChatSequence(id, parsed.data.enabled, parsed.data.steps as SequenceStepInput[]);
    if (user.role === "ADMIN") {
      await database.auditLog.create({
        data: {
          actorId: user.id,
          action: "chat_sequence.update",
          entityType: "creator",
          entityId: id,
          metadata: { enabled: parsed.data.enabled, steps: parsed.data.steps.length },
        },
      });
    }
    return {
      creatorId: id,
      enabled: saved.enabled,
      steps: saved.steps.map(presentStep),
    };
  }
}

function presentStep(step: {
  position: number;
  delayMinutes: number;
  bodyTemplate: string;
  offerMode: string;
  postId: string | null;
  recurring: boolean;
}) {
  return {
    position: step.position,
    delayMinutes: step.delayMinutes,
    bodyTemplate: step.bodyTemplate,
    offerMode: step.offerMode,
    postId: step.postId,
    recurring: step.recurring,
  };
}

@Module({ controllers: [ChatController, ChatSequenceController] })
export class ChatModule {}
