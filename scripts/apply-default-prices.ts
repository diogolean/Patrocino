import { PrismaClient } from "../packages/db/src/index";
import { catalogDefaults, sarahMitchellPlanId } from "../packages/core/src/currency";

type PriceDb = PrismaClient;

export type PriceChange = {
  entity: "plan" | "post" | "creator";
  id: string;
  creatorId: string;
  field: string;
  from: number | null;
  to: number;
};

const terms = [1, 3, 6, 12] as const;

function isSarah(input: {
  email: string;
  name: string;
  username: string;
  planIds: string[];
}) {
  if (input.planIds.includes(sarahMitchellPlanId)) return true;
  if (input.username.trim().toLowerCase() === "sarah-mitchell") return true;
  if (input.email.trim().toLowerCase() === "sarah-mitchell@creators.patrocino.com") return true;
  return input.name.trim().toLowerCase() === "sarah mitchell";
}

export async function applyDefaultPrices(db: PriceDb, options: { dryRun: boolean; creatorIds?: string[] }) {
  const creators = await db.creator.findMany({
    where: options.creatorIds ? { id: { in: options.creatorIds } } : undefined,
    include: {
      user: { include: { profile: true } },
      plans: true,
      posts: { where: { deletedAt: null } },
    },
  });
  const changes: PriceChange[] = [];
  for (const creator of creators) {
    const profile = creator.user.profile;
    if (
      isSarah({
        email: creator.user.email,
        name: profile?.name ?? "",
        username: profile?.username ?? "",
        planIds: creator.plans.map((plan) => plan.id),
      })
    ) {
      continue;
    }
    if (creator.defaultVideoPriceCents !== catalogDefaults.videoBrlCents) {
      changes.push({
        entity: "creator",
        id: creator.id,
        creatorId: creator.id,
        field: "defaultVideoPriceCents",
        from: creator.defaultVideoPriceCents,
        to: catalogDefaults.videoBrlCents,
      });
    }
    if (creator.defaultVideoPriceCentsUsd !== catalogDefaults.videoUsdCents) {
      changes.push({
        entity: "creator",
        id: creator.id,
        creatorId: creator.id,
        field: "defaultVideoPriceCentsUsd",
        from: creator.defaultVideoPriceCentsUsd,
        to: catalogDefaults.videoUsdCents,
      });
    }
    if (creator.guestVideoPriceCents !== catalogDefaults.guestVideoBrlCents) {
      changes.push({
        entity: "creator",
        id: creator.id,
        creatorId: creator.id,
        field: "guestVideoPriceCents",
        from: creator.guestVideoPriceCents,
        to: catalogDefaults.guestVideoBrlCents,
      });
    }
    if (creator.guestVideoPriceCentsUsd !== catalogDefaults.guestVideoUsdCents) {
      changes.push({
        entity: "creator",
        id: creator.id,
        creatorId: creator.id,
        field: "guestVideoPriceCentsUsd",
        from: creator.guestVideoPriceCentsUsd,
        to: catalogDefaults.guestVideoUsdCents,
      });
    }
    for (const months of terms) {
      const plan = creator.plans.find((item) => item.durationMonths === months);
      if (!plan) continue;
      const discount = catalogDefaults.termDiscounts[months];
      const brl = catalogDefaults.monthlyBrlCents * months;
      const usd = catalogDefaults.monthlyUsdCents * months;
      if (plan.priceCents !== brl) {
        changes.push({ entity: "plan", id: plan.id, creatorId: creator.id, field: "priceCents", from: plan.priceCents, to: brl });
      }
      if (plan.priceCentsUsd !== usd) {
        changes.push({ entity: "plan", id: plan.id, creatorId: creator.id, field: "priceCentsUsd", from: plan.priceCentsUsd, to: usd });
      }
      if (plan.discountPercent !== discount) {
        changes.push({
          entity: "plan",
          id: plan.id,
          creatorId: creator.id,
          field: "discountPercent",
          from: plan.discountPercent,
          to: discount,
        });
      }
    }
    for (const post of creator.posts) {
      if (post.visibility !== "PPV" && post.visibility !== "SUBSCRIBER_PPV") continue;
      if (post.priceCents == null && post.visibility !== "PPV") continue;
      if (post.priceCents !== catalogDefaults.videoBrlCents) {
        changes.push({
          entity: "post",
          id: post.id,
          creatorId: creator.id,
          field: "priceCents",
          from: post.priceCents,
          to: catalogDefaults.videoBrlCents,
        });
      }
      if (post.priceCentsUsd !== catalogDefaults.videoUsdCents) {
        changes.push({
          entity: "post",
          id: post.id,
          creatorId: creator.id,
          field: "priceCentsUsd",
          from: post.priceCentsUsd,
          to: catalogDefaults.videoUsdCents,
        });
      }
      if (post.guestPriceCents !== catalogDefaults.guestVideoBrlCents) {
        changes.push({
          entity: "post",
          id: post.id,
          creatorId: creator.id,
          field: "guestPriceCents",
          from: post.guestPriceCents,
          to: catalogDefaults.guestVideoBrlCents,
        });
      }
      if (post.guestPriceCentsUsd !== catalogDefaults.guestVideoUsdCents) {
        changes.push({
          entity: "post",
          id: post.id,
          creatorId: creator.id,
          field: "guestPriceCentsUsd",
          from: post.guestPriceCentsUsd,
          to: catalogDefaults.guestVideoUsdCents,
        });
      }
    }
  }

  if (!options.dryRun && changes.length) {
    const byPlan = new Map<string, { priceCents?: number; priceCentsUsd?: number; discountPercent?: number }>();
    const byPost = new Map<string, { priceCents?: number; priceCentsUsd?: number; guestPriceCents?: number; guestPriceCentsUsd?: number }>();
    const byCreator = new Map<string, { defaultVideoPriceCents?: number; defaultVideoPriceCentsUsd?: number; guestVideoPriceCents?: number; guestVideoPriceCentsUsd?: number }>();
    for (const change of changes) {
      if (change.entity === "plan") {
        const current = byPlan.get(change.id) ?? {};
        if (change.field === "priceCents" || change.field === "priceCentsUsd" || change.field === "discountPercent") {
          current[change.field] = change.to;
        }
        byPlan.set(change.id, current);
      } else if (change.entity === "post") {
        const current = byPost.get(change.id) ?? {};
        if (change.field === "priceCents" || change.field === "priceCentsUsd" || change.field === "guestPriceCents" || change.field === "guestPriceCentsUsd") {
          current[change.field] = change.to;
        }
        byPost.set(change.id, current);
      } else {
        const current = byCreator.get(change.id) ?? {};
        if (
          change.field === "defaultVideoPriceCents" ||
          change.field === "defaultVideoPriceCentsUsd" ||
          change.field === "guestVideoPriceCents" ||
          change.field === "guestVideoPriceCentsUsd"
        ) {
          current[change.field] = change.to;
        }
        byCreator.set(change.id, current);
      }
    }
    await db.$transaction(async (tx) => {
      for (const [id, data] of byCreator) await tx.creator.update({ where: { id }, data });
      for (const [id, data] of byPlan) await tx.plan.update({ where: { id }, data });
      for (const [id, data] of byPost) await tx.post.update({ where: { id }, data });
    });
  }

  return { dryRun: options.dryRun, changes };
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const db = new PrismaClient();
  try {
    const result = await applyDefaultPrices(db, { dryRun });
    if (result.changes.length === 0) {
      console.log(dryRun ? "dry-run: no price changes" : "applied: no price changes");
      return;
    }
    for (const change of result.changes) {
      console.log(
        `${dryRun ? "would update" : "updated"} ${change.entity} ${change.id} ${change.field} ${change.from ?? "null"} -> ${change.to}`,
      );
    }
    console.log(`${dryRun ? "dry-run" : "applied"}: ${result.changes.length} change(s)`);
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.includes("apply-default-prices")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "price update failed");
    process.exit(1);
  });
}
