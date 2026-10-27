import { database } from "@mimelux/db/runtime";

const creatorInclude = { user: { include: { profile: true } } } as const;

export async function findCreatorByKey(creatorKey: string) {
  const byId = await database.creator.findUnique({ where: { id: creatorKey }, include: creatorInclude });
  if (byId) return byId;
  const byUsername = await database.creator.findFirst({
    where: { user: { profile: { is: { username: creatorKey } } } },
    include: creatorInclude,
  });
  if (byUsername) return byUsername;
  const stripped = creatorKey.replace(/-/g, "");
  if (!stripped || stripped === creatorKey) return null;
  return database.creator.findFirst({
    where: { user: { profile: { is: { username: stripped } } } },
    include: creatorInclude,
  });
}
