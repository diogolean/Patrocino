import { apiError } from "../../http/api-error";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Module,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Prisma, database } from "@mimelux/db/runtime";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { verify } from "jsonwebtoken";
import { z } from "zod";
import { ensureAdmins } from "./ensure-admin";
import { AdminRevenueController } from "./admin-revenue.controller";

const roles = ["FAN", "CREATOR", "AFFILIATE", "ADMIN"] as const;
const patchSchema = z.object({
  role: z.enum(roles).optional(),
  suspended: z.boolean().optional(),
  name: z.string().min(2).max(80).optional(),
  username: z.string().min(2).max(40).optional(),
  bio: z.string().max(500).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
});

type AccessPayload = { sub: string; email: string; role: string };

function readAccess(authorization?: string): AccessPayload {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw apiError(401, "MISSING_ACCESS_TOKEN", "Missing access token");
  try {
    const payload = verify(token, process.env.JWT_ACCESS_SECRET ?? "local-access-only") as {
      sub?: string;
      email?: string;
      role?: string;
    };
    if (!payload.sub || !payload.email || !payload.role) throw new Error("Incomplete token");
    return { sub: payload.sub, email: payload.email, role: payload.role };
  } catch {
    throw apiError(401, "INVALID_ACCESS_TOKEN", "Invalid access token");
  }
}

async function requireAdmin(authorization?: string) {
  const access = readAccess(authorization);
  if (access.role !== "ADMIN") throw apiError(403, "ADMIN_ONLY", "Admin only");
  const actor = await database.user.findUnique({ where: { id: access.sub } });
  if (!actor || actor.role !== "ADMIN" || actor.deletedAt || actor.suspendedAt) {
    throw apiError(403, "ADMIN_ONLY", "Admin only");
  }
  return actor;
}

function publicUser(user: {
  id: string;
  email: string;
  role: string;
  suspendedAt: Date | null;
  deletedAt: Date | null;
  mustResetPassword: boolean;
  isDemo: boolean;
  createdAt: Date;
  profile: { name: string; username: string; bio: string | null; city: string | null } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    suspended: Boolean(user.suspendedAt),
    deleted: Boolean(user.deletedAt),
    mustResetPassword: user.mustResetPassword,
    isDemo: user.isDemo,
    createdAt: user.createdAt,
    name: user.profile?.name ?? "",
    username: user.profile?.username ?? "",
    bio: user.profile?.bio ?? "",
    city: user.profile?.city ?? "",
  };
}

const userSelect = {
  id: true,
  email: true,
  role: true,
  suspendedAt: true,
  deletedAt: true,
  mustResetPassword: true,
  isDemo: true,
  createdAt: true,
  profile: { select: { name: true, username: true, bio: true, city: true } },
} as const;

async function audit(actorId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  await database.auditLog.create({
    data: {
      actorId,
      action,
      entityType: "user",
      entityId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
class AdminController {
  @Get("users")
  async list(@Headers("authorization") authorization: string | undefined, @Query("q") q?: string) {
    await requireAdmin(authorization);
    const query = q?.trim();
    const users = await database.user.findMany({
      where: {
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { email: { contains: query, mode: "insensitive" } },
                { profile: { name: { contains: query, mode: "insensitive" } } },
                { profile: { username: { contains: query, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      select: userSelect,
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return { users: users.map(publicUser) };
  }

  @Get("users/:id")
  async detail(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    await requireAdmin(authorization);
    const user = await database.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw apiError(400, "USER_NOT_FOUND", "User not found");
    const auditLogs = await database.auditLog.findMany({
      where: { entityType: "user", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, createdAt: true, metadata: true, actorId: true },
    });
    return { user: publicUser(user), audit: auditLogs };
  }

  @Patch("users/:id")
  async update(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const actor = await requireAdmin(authorization);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw apiError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request");
    }
    const input = parsed.data;
    if (actor.id === id && (input.role && input.role !== "ADMIN" || input.suspended === true)) {
      throw apiError(400, "YOU_CANNOT_REMOVE_YOUR_OWN_ADMIN_ACCESS", "You cannot remove your own admin access");
    }
    const user = await database.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw apiError(400, "USER_NOT_FOUND", "User not found");
    try {
      const updated = await database.user.update({
        where: { id },
        data: {
          role: input.role,
          suspendedAt: input.suspended === undefined ? undefined : input.suspended ? new Date() : null,
          profile: input.name || input.username || input.bio !== undefined || input.city !== undefined
            ? {
                upsert: {
                  update: {
                    name: input.name,
                    username: input.username,
                    bio: input.bio,
                    city: input.city,
                  },
                  create: {
                    name: input.name ?? user.email,
                    username: input.username ?? `user-${randomBytes(4).toString("hex")}`,
                    bio: input.bio,
                    city: input.city,
                  },
                },
              }
            : undefined,
        },
        select: userSelect,
      });
      await audit(actor.id, "user.update", id, JSON.parse(JSON.stringify(input)) as Record<string, unknown>);
      return { user: publicUser(updated) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw apiError(400, "USERNAME_ALREADY_TAKEN", "Username already taken");
      }
      throw error;
    }
  }

  @Post("users/:id/reset-password")
  async resetPassword(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const actor = await requireAdmin(authorization);
    const user = await database.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw apiError(400, "USER_NOT_FOUND", "User not found");
    const temporaryPassword = randomBytes(9).toString("base64url");
    await database.user.update({
      where: { id },
      data: { passwordHash: await hash(temporaryPassword, 12), mustResetPassword: true, refreshTokenHash: null },
    });
    await audit(actor.id, "user.reset-password", id, { mustResetPassword: true });
    return { temporaryPassword };
  }

  @Delete("users/:id")
  async remove(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const actor = await requireAdmin(authorization);
    if (actor.id === id) throw apiError(400, "YOU_CANNOT_DELETE_YOUR_OWN_ADMIN_ACCOUNT", "You cannot delete your own admin account");
    const user = await database.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw apiError(400, "USER_NOT_FOUND", "User not found");
    await database.user.update({
      where: { id },
      data: { deletedAt: new Date(), refreshTokenHash: null },
    });
    await audit(actor.id, "user.delete", id, { soft: true });
    return { deleted: true };
  }
}

class AdminBoot implements OnModuleInit {
  async onModuleInit() {
    await ensureAdmins();
  }
}

@Module({
  controllers: [AdminController, AdminRevenueController],
  providers: [AdminBoot],
})
export class AdminModule {}
