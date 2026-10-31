import { createHmac, timingSafeEqual } from "node:crypto";

export type MediaGrant = {
  mediaId: string;
  userId: string;
  exp: number;
  kind: "file" | "poster";
};

export const MEDIA_GRANT_TTL_SECONDS = 8 * 60;

function secret() {
  return process.env.JWT_ACCESS_SECRET ?? "local-access-only";
}

export function signMediaGrant(grant: MediaGrant, key = secret()) {
  const payload = Buffer.from(
    JSON.stringify({
      mediaId: grant.mediaId,
      userId: grant.userId,
      exp: grant.exp,
      kind: grant.kind,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readMediaGrant(token: string, now = Date.now(), key = secret(), kind: MediaGrant["kind"] = "file"): MediaGrant | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<MediaGrant>;
    if (parsed.kind !== kind) return null;
    if (typeof parsed.mediaId !== "string" || !parsed.mediaId) return null;
    if (typeof parsed.userId !== "string" || !parsed.userId) return null;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;
    if (parsed.exp * 1000 <= now) return null;
    return { mediaId: parsed.mediaId, userId: parsed.userId, exp: parsed.exp, kind };
  } catch {
    return null;
  }
}
