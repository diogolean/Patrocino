-- Dual currency amounts. Existing cent values are copied so a row keeps its price
-- until the separate catalog script updates creators other than Sarah Mitchell.
ALTER TABLE "plans" ADD COLUMN "priceCentsUsd" INTEGER NOT NULL DEFAULT 0;
UPDATE "plans" SET "priceCentsUsd" = "priceCents";
ALTER TABLE "plans" ADD COLUMN "stripePriceIdUsd" TEXT;

ALTER TABLE "posts" ADD COLUMN "priceCentsUsd" INTEGER;
UPDATE "posts" SET "priceCentsUsd" = "priceCents" WHERE "priceCents" IS NOT NULL;

ALTER TABLE "content_packs" ADD COLUMN "priceCentsUsd" INTEGER NOT NULL DEFAULT 0;
UPDATE "content_packs" SET "priceCentsUsd" = "priceCents";

ALTER TABLE "creators" ADD COLUMN "defaultVideoPriceCentsUsd" INTEGER NOT NULL DEFAULT 1900;
UPDATE "creators" SET "defaultVideoPriceCentsUsd" = "defaultVideoPriceCents";

ALTER TABLE "messages" ADD COLUMN "ppvPriceCentsUsd" INTEGER;
UPDATE "messages" SET "ppvPriceCentsUsd" = "ppvPriceCents" WHERE "ppvPriceCents" IS NOT NULL;

ALTER TABLE "platform_settings" ADD COLUMN "defaultPackPriceCentsBrl" INTEGER NOT NULL DEFAULT 14900;
ALTER TABLE "platform_settings" ADD COLUMN "defaultPackPriceCentsUsd" INTEGER NOT NULL DEFAULT 4900;

ALTER TABLE "subscriptions" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BRL';

ALTER TABLE "users" ADD COLUMN "referredClickId" TEXT;

ALTER TABLE "affiliates" ADD COLUMN "commissionBps" INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE "affiliates" ADD COLUMN "emailPlaceholder" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "affiliate_assignments" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "commissionBps" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "affiliate_assignments_affiliateId_creatorId_key" ON "affiliate_assignments"("affiliateId", "creatorId");
CREATE INDEX "affiliate_assignments_creatorId_idx" ON "affiliate_assignments"("creatorId");

ALTER TABLE "affiliate_assignments" ADD CONSTRAINT "affiliate_assignments_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "affiliate_assignments" ADD CONSTRAINT "affiliate_assignments_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_links" ADD COLUMN "code" TEXT;
UPDATE "affiliate_links" SET "code" = "slug" WHERE "code" IS NULL;
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "code" ORDER BY "createdAt", "id") AS n
  FROM "affiliate_links"
)
UPDATE "affiliate_links" AS link
SET "code" = link."code" || '-' || SUBSTRING(link."id", 1, 6)
FROM ranked
WHERE link."id" = ranked."id" AND ranked.n > 1;
UPDATE "affiliate_links" SET "code" = "id" WHERE "code" IS NULL OR "code" = '';
ALTER TABLE "affiliate_links" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "affiliate_links_code_key" ON "affiliate_links"("code");
