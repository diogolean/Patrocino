import { database } from "@mimelux/db/runtime";
import { exclusiveVideoIndex, exclusiveVideoLabel, redactVideoTitle } from "@mimelux/core/exclusive-video";

const ordinalCache = new Map<string, Promise<string[]>>();

export function videoOrdinalIds(creatorId: string) {
  const cached = ordinalCache.get(creatorId);
  if (cached) return cached;
  const pending = database.post
    .findMany({
      where: { creatorId, deletedAt: null, media: { some: { kind: "VIDEO" } } },
      orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    })
    .then((rows) => rows.map((row) => row.id))
    .finally(() => {
      ordinalCache.delete(creatorId);
    });
  ordinalCache.set(creatorId, pending);
  return pending;
}

export async function publicVideoText(input: {
  creatorId: string;
  postId: string;
  secret?: string | null;
  text?: string | null;
  locale?: string | null;
}) {
  const ids = await videoOrdinalIds(input.creatorId);
  const label = exclusiveVideoLabel(exclusiveVideoIndex(ids, input.postId), input.locale);
  return {
    exclusiveIndex: exclusiveVideoIndex(ids, input.postId),
    label,
    text: redactVideoTitle(input.text ?? "", input.secret, label),
  };
}
