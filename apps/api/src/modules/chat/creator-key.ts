import { database } from "@mimelux/db/runtime";

export async function findCreatorByKey(creatorKey: string) {
  const keys = Array.from(new Set([creatorKey, creatorKey.replace(/-/g, "")]));
  return database.creator.findFirst({
    where: {
      OR: [{ id: { in: keys } }, { user: { profile: { is: { username: { in: keys } } } } }],
    },
    include: { user: { include: { profile: true } } },
  });
}
