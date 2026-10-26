-- CreateTable
CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'expay',
    "providerChargeId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" TEXT NOT NULL,
    "billingMode" TEXT NOT NULL,
    "mandateId" TEXT,
    "copiaECola" TEXT,
    "qrCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "accessActive" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_receipts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'expay',
    "providerEventId" TEXT NOT NULL,
    "providerChargeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pix_mandate_records" (
    "id" TEXT NOT NULL,
    "providerMandateId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pix_mandate_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_providerChargeId_key" ON "payment_records"("providerChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_idempotencyKey_key" ON "payment_records"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_records_buyerId_purpose_subjectId_idx" ON "payment_records"("buyerId", "purpose", "subjectId");

-- CreateIndex
CREATE INDEX "payment_records_status_idx" ON "payment_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_receipts_provider_providerEventId_key" ON "payment_webhook_receipts"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "payment_webhook_receipts_providerChargeId_idx" ON "payment_webhook_receipts"("providerChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "pix_mandate_records_providerMandateId_key" ON "pix_mandate_records"("providerMandateId");

-- CreateIndex
CREATE INDEX "pix_mandate_records_buyerId_creatorId_idx" ON "pix_mandate_records"("buyerId", "creatorId");
