-- AlterTable
ALTER TABLE "payment_webhook_receipts" ADD COLUMN "environment" TEXT;

UPDATE "payment_webhook_receipts" SET "environment" = 'prod' WHERE "environment" IS NULL;

ALTER TABLE "payment_webhook_receipts" ALTER COLUMN "environment" SET NOT NULL;

-- DropIndex
DROP INDEX "payment_webhook_receipts_provider_providerEventId_key";

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_receipts_provider_providerEventId_environment_key" ON "payment_webhook_receipts"("provider", "providerEventId", "environment");
