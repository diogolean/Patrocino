import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Module,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { database } from "@mimelux/db/runtime";
import { z } from "zod";
import { requireUser } from "../auth/require-user";
import { isPushEndpoint, publicVapid, readVapidConfig } from "./push";
import { listUnreadForFan } from "./unread";

const subscriptionSchema = z.object({
  endpoint: z.string().max(4096).refine(isPushEndpoint, "Invalid endpoint"),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(200),
    auth: z.string().trim().min(1).max(200),
  }),
});

const endpointSchema = z.object({
  endpoint: z.string().max(4096).refine(isPushEndpoint, "Invalid endpoint"),
});

@ApiTags("notifications")
@Controller("notifications")
class NotificationsController {
  @Get("unread")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Unread creator messages for the signed-in fan" })
  async unread(@Headers("authorization") authorization: string | undefined) {
    const user = await requireUser(authorization);
    return listUnreadForFan(user.id);
  }
}

@ApiTags("push")
@Controller("push")
class PushController {
  @Get("vapid")
  @ApiOperation({ summary: "Public VAPID key, or disabled when push is off" })
  vapid() {
    return publicVapid(readVapidConfig(process.env));
  }

  @Post("subscriptions")
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Store a Web Push subscription for this fan" })
  async save(
    @Headers("authorization") authorization: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Body() body: unknown,
  ) {
    const config = readVapidConfig(process.env);
    if (!config) return { enabled: false as const };
    const user = await requireUser(authorization);
    const parsed = subscriptionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
    const saved = await database.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: {
        userId: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: userAgent?.slice(0, 300),
      },
      update: {
        userId: user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: userAgent?.slice(0, 300),
      },
    });
    return { enabled: true as const, id: saved.id };
  }

  @Delete("subscriptions")
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove a Web Push subscription for this fan" })
  async remove(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const user = await requireUser(authorization);
    const parsed = endpointSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid request");
    const result = await database.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: user.id },
    });
    return { deleted: result.count };
  }
}

@Module({ controllers: [NotificationsController, PushController] })
export class NotificationsModule {}
