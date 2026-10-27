import { apiError } from "../../http/api-error";
import { BadRequestException, Body, Controller, Get, Headers, Module, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { requireUser } from "../auth/require-user";
import { cancelSubscription, listMySubscriptions, resolvePlan, startSubscriptionCheckout, viewerHasAccess } from "../payments/billing";

const checkoutSchema = z.strictObject({
  creatorId: z.string().min(1),
  planId: z.string().min(1),
});

@ApiTags("subscriptions")
@ApiBearerAuth()
@Controller("subscriptions")
class SubscriptionsController {
  @Get("me")
  @ApiOperation({ summary: "List the signed-in user's subscriptions" })
  async list(@Headers("authorization") authorization: string | undefined) {
    const user = await requireUser(authorization);
    return listMySubscriptions(user.id);
  }

  @Get("access")
  @ApiOperation({ summary: "Whether the signed-in user can read a creator's subscriber content" })
  async access(@Headers("authorization") authorization: string | undefined, @Query("creatorId") creatorId = "") {
    const user = await requireUser(authorization);
    const resolved = await resolvePlan(creatorId, "monthly");
    const id = resolved?.creator.id ?? creatorId;
    return { creatorId: id, access: await viewerHasAccess(user.id, id) };
  }

  @Post("checkout")
  @ApiOperation({ summary: "Start a Stripe subscription or a local simulation when Stripe is off" })
  async checkout(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const user = await requireUser(authorization);
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    return startSubscriptionCheckout(user, parsed.data.creatorId, parsed.data.planId);
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel a subscription at the end of the current period" })
  async cancel(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const user = await requireUser(authorization);
    return cancelSubscription(user.id, id);
  }
}

@Module({ controllers: [SubscriptionsController] })
export class SubscriptionsModule {}
