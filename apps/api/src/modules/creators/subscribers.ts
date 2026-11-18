import { database } from "@mimelux/db/runtime";

/** Buyers who must not inflate a public subscriber count. */
export function isCountableSubscriber(input: {
  status: string;
  subscriptionDemo?: boolean;
  fanDemo?: boolean;
  role: string;
  email: string;
}) {
  if (input.status !== "ACTIVE" || input.subscriptionDemo || input.fanDemo) return false;
  if (input.role === "ADMIN") return false;
  const email = input.email.trim().toLowerCase();
  if (email.startsWith("qa.")) return false;
  if (email.endsWith("@example.com") || email.endsWith("@mimelux.test")) return false;
  return true;
}

export function realSubscriberWhere(creatorIds?: string[]) {
  return {
    status: "ACTIVE" as const,
    isDemo: false,
    ...(creatorIds ? { creatorId: { in: creatorIds } } : {}),
    fan: {
      isDemo: false,
      role: { not: "ADMIN" as const },
      NOT: {
        OR: [
          { email: { startsWith: "qa.", mode: "insensitive" as const } },
          { email: { endsWith: "@example.com", mode: "insensitive" as const } },
          { email: { endsWith: "@mimelux.test", mode: "insensitive" as const } },
        ],
      },
    },
  };
}

export async function subscriberCounts(creatorIds: string[]) {
  const counts = new Map<string, number>();
  if (!creatorIds.length) return counts;
  const rows = await database.subscription.groupBy({
    by: ["creatorId"],
    where: realSubscriberWhere(creatorIds),
    _count: { _all: true },
  });
  for (const row of rows) counts.set(row.creatorId, row._count._all);
  return counts;
}
