import { apiError } from "../../http/api-error";
import { UnauthorizedException } from "@nestjs/common";
import { database } from "@mimelux/db/runtime";
import { verify } from "jsonwebtoken";

export async function requireUser(authorization?: string) {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw apiError(401, "MISSING_ACCESS_TOKEN", "Missing access token");
  let userId = "";
  try {
    const payload = verify(token, process.env.JWT_ACCESS_SECRET ?? "local-access-only") as { sub?: string };
    if (!payload.sub) throw new Error("Incomplete token");
    userId = payload.sub;
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    throw apiError(401, "INVALID_ACCESS_TOKEN", "Invalid access token");
  }
  const user = await database.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt || user.suspendedAt) throw apiError(401, "INVALID_ACCESS_TOKEN", "Invalid access token");
  return user;
}

export async function optionalUser(authorization?: string) {
  if (!authorization) return null;
  try {
    return await requireUser(authorization);
  } catch {
    return null;
  }
}
