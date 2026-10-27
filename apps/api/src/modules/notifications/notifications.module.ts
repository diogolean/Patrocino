import { Controller, Get, Headers, Module } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { requireUser } from "../auth/require-user";
import { listUnreadForFan } from "./unread";

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

@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
