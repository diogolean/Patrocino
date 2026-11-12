import { database } from "@mimelux/db/runtime";
import { backfillPaidPreviews } from "../apps/api/src/modules/media/paid-preview-backfill";

/**
 * Seal clear posters for paid photos and videos, and build a blurred preview when one is missing.
 *
 * The public gallery serves `/media/uploads/.../previews/...jpg`. Clear posters move to
 * `uploads/.../private/posters/`, which Caddy and the Next /media route already refuse.
 * FREE posters stay at `uploads/.../posters/` and remain publicly fetchable.
 *
 * Dry-run is the default. Nothing is written until --apply.
 * Point MEDIA_ROOT at the media disk and DATABASE_URL at that environment. Do not run it
 * against a database you did not mean to change.
 *
 *   pnpm exec tsx scripts/backfill-paid-previews.ts
 *   pnpm exec tsx scripts/backfill-paid-previews.ts --creator sophie-bennet
 *   pnpm exec tsx scripts/backfill-paid-previews.ts --apply
 *
 * Deploy order:
 * 1. Deploy this code first, so public galleries point at blurred previews.
 * 2. Run this script with --apply on the server (idempotent; a second run is a no-op).
 * 3. Purge Cloudflare for `/media/uploads/.../posters/...`. Those URLs were cached
 *    `public, max-age=31536000, immutable`, so origin 404s do not evict the clear JPEG
 *    until the cache is purged. FREE posters live under the same prefix and will be
 *    fetched again as the clear file.
 * 4. When a teaser is later marked FREE, the media update moves its poster back to the
 *    public path (or run this script again). Purge that poster URL if a 404 was cached.
 */

async function creatorIdFrom(key: string) {
  const keys = Array.from(new Set([key, key.replace(/-/g, "")]));
  const creator = await database.creator.findFirst({
    where: {
      OR: [{ id: { in: keys } }, { user: { profile: { is: { username: { in: keys } } } } }],
    },
    select: { id: true },
  });
  if (!creator) throw new Error(`Creator not found: ${key}`);
  return creator.id;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const creatorFlag = process.argv.indexOf("--creator");
  const creatorKey = creatorFlag >= 0 ? process.argv[creatorFlag + 1] : undefined;
  if (creatorFlag >= 0 && !creatorKey) throw new Error("--creator needs a username or id");
  const creatorId = creatorKey ? await creatorIdFrom(creatorKey) : undefined;
  const report = await backfillPaidPreviews({ apply, creatorId });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1]?.includes("backfill-paid-previews")) {
  main()
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : "backfill failed"}\n`);
      process.exitCode = 1;
    })
    .finally(() => database.$disconnect());
}
