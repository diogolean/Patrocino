import { apiError } from "../../http/api-error";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Module,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { consentVersion } from "@mimelux/core/legal";
import { Prisma, database } from "@mimelux/db/runtime";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireUser } from "../auth/require-user";
import { cancelSubscription } from "../payments/billing";

const consentSchema = z.object({
  version: z.string().min(1).max(40),
  analytics: z.boolean(),
  marketing: z.boolean(),
});

const deletionSchema = z.object({
  password: z.string().min(6).max(120),
  confirm: z.string().min(1).max(40),
});

const exportWindowMs = 60 * 60 * 1000;

function exportLimit() {
  const parsed = Number(process.env.PRIVACY_EXPORT_LIMIT ?? 3);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

@ApiTags("privacy")
@ApiBearerAuth()
@Controller("privacy")
class PrivacyController {
  @Post("consent")
  @HttpCode(200)
  async saveConsent(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const user = await requireUser(authorization);
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    if (parsed.data.version !== consentVersion) throw apiError(400, "CONSENT_VERSION_IS_OUTDATED", "Consent version is outdated");
    const record = await database.consentRecord.create({
      data: {
        userId: user.id,
        version: parsed.data.version,
        necessary: true,
        analytics: parsed.data.analytics,
        marketing: parsed.data.marketing,
      },
    });
    return {
      consent: {
        id: record.id,
        version: record.version,
        necessary: true,
        analytics: record.analytics,
        marketing: record.marketing,
        createdAt: record.createdAt.toISOString(),
      },
    };
  }

  @Get("export")
  async exportData(@Headers("authorization") authorization: string | undefined) {
    const user = await requireUser(authorization);
    const since = new Date(Date.now() - exportWindowMs);
    const recent = await database.privacyRequest.count({
      where: { userId: user.id, kind: "export", createdAt: { gte: since } },
    });
    if (recent >= exportLimit()) throw apiError(429, "EXPORT_RATE_LIMIT", "Export rate limit");
    await database.privacyRequest.create({ data: { userId: user.id, kind: "export" } });
    await database.auditLog.create({
      data: {
        actorId: user.id,
        action: "privacy.export",
        entityType: "user",
        entityId: user.id,
        metadata: {},
      },
    });

    const [profile, subscriptions, purchases, consents, messages] = await Promise.all([
      database.profile.findUnique({ where: { userId: user.id } }),
      database.subscription.findMany({
        where: { fanId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      database.purchase.findMany({
        where: { buyerId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      database.consentRecord.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      database.message.findMany({
        where: { senderId: user.id },
        orderBy: { createdAt: "desc" },
        include: { media: { select: { id: true } } },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: profile?.name ?? "",
        username: profile?.username ?? "",
        bio: profile?.bio ?? "",
        city: profile?.city ?? "",
        createdAt: user.createdAt.toISOString(),
        acceptedTermsAt: user.acceptedTermsAt?.toISOString() ?? null,
        termsVersion: user.termsVersion,
      },
      subscriptions: subscriptions.map((row) => ({
        id: row.id,
        creatorId: row.creatorId,
        status: row.status,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      purchases: purchases.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        amountCents: row.amountCents,
        currency: row.currency,
        createdAt: row.createdAt.toISOString(),
      })),
      consents: consents.map((row) => ({
        id: row.id,
        version: row.version,
        necessary: row.necessary,
        analytics: row.analytics,
        marketing: row.marketing,
        createdAt: row.createdAt.toISOString(),
      })),
      messages: messages.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        createdAt: row.createdAt.toISOString(),
        ppv: row.ppvPriceCents != null,
        hasMedia: row.media.length > 0,
      })),
    };
  }

  @Post("deletion")
  @HttpCode(200)
  async deleteAccount(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const user = await requireUser(authorization);
    const parsed = deletionSchema.safeParse(body);
    if (!parsed.success) throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    if (parsed.data.confirm !== "EXCLUIR") throw apiError(400, "CONFIRMATION_REQUIRED", "Confirmation required");
    const current = await database.user.findUnique({ where: { id: user.id } });
    if (!current || !(await compare(parsed.data.password, current.passwordHash))) {
      throw apiError(401, "WRONG_PASSWORD", "Wrong password");
    }

    const owned = await database.subscription.findMany({
      where: { fanId: user.id, status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] } },
      select: { id: true },
    });
    for (const subscription of owned) {
      try {
        await cancelSubscription(user.id, subscription.id);
      } catch {
        continue;
      }
    }

    const creator = await database.creator.findUnique({ where: { userId: user.id }, select: { id: true } });
    const now = new Date();
    const passwordHash = await hash(randomBytes(32).toString("hex"), 12);
    const anonymousEmail = `deleted-${user.id}@users.invalid`;

    await database.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: {
          OR: [{ fanId: user.id }, ...(creator ? [{ creatorId: creator.id }] : [])],
          status: { in: ["ACTIVE", "PAST_DUE", "PENDING", "CANCELED"] },
        },
        data: { status: "EXPIRED", cancelAtPeriodEnd: true, currentPeriodEnd: now, endsAt: now },
      });
      if (creator) {
        await tx.creator.update({ where: { id: creator.id }, data: { status: "SUSPENDED" } });
        await tx.post.updateMany({ where: { creatorId: creator.id, deletedAt: null }, data: { deletedAt: now } });
      }
      const affiliate = await tx.affiliate.findUnique({ where: { userId: user.id } });
      if (affiliate) {
        await tx.affiliate.update({
          where: { id: affiliate.id },
          data: {
            code: `x${user.id}`,
            displayName: "Conta excluída",
            status: "INACTIVE",
            payoutDetails: Prisma.DbNull,
          },
        });
        await tx.affiliateLink.updateMany({ where: { affiliateId: affiliate.id }, data: { active: false } });
      }
      await tx.message.updateMany({ where: { senderId: user.id }, data: { body: "" } });
      await tx.specialRequest.updateMany({ where: { fanId: user.id }, data: { description: "", deliveryUrl: null } });
      const requests = await tx.specialRequest.findMany({ where: { fanId: user.id }, select: { id: true } });
      if (requests.length) {
        await tx.specialRequestMessage.updateMany({
          where: { requestId: { in: requests.map((request) => request.id) } },
          data: { body: "" },
        });
      }
      await tx.attribution.updateMany({ where: { fanId: user.id }, data: { fanId: null } });
      await tx.profile.updateMany({
        where: { userId: user.id },
        data: {
          name: "Conta excluída",
          username: `excluida-${user.id.slice(-10)}`,
          bio: null,
          city: null,
          avatarUrl: null,
          coverUrl: null,
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: anonymousEmail,
          passwordHash,
          refreshTokenHash: null,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
          stripeCustomerId: null,
          acceptedTermsIp: null,
          deletedAt: now,
        },
      });
      await tx.privacyRequest.create({ data: { userId: user.id, kind: "deletion" } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "privacy.deletion",
          entityType: "user",
          entityId: user.id,
          metadata: { creatorHidden: Boolean(creator) },
        },
      });
    });

    return { deleted: true };
  }
}

@Module({ controllers: [PrivacyController] })
export class PrivacyModule {}
