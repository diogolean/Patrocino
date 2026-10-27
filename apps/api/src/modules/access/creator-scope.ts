import { apiError } from "../../http/api-error";
import { ForbiddenException } from "@nestjs/common";
import { database } from "@mimelux/db/runtime";

export async function ownsCreator(user: { id: string; role: string }, creatorId: string) {
  if (user.role === "ADMIN") return true;
  if (user.role !== "CREATOR") return false;
  const own = await database.creator.findUnique({ where: { userId: user.id }, select: { id: true } });
  return own?.id === creatorId;
}

export async function assertOwnsCreator(user: { id: string; role: string }, creatorId: string) {
  if (await ownsCreator(user, creatorId)) return;
  throw apiError(403, "CREATOR_ONLY", "Creator only");
}
