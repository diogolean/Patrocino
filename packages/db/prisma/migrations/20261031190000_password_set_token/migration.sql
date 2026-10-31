ALTER TABLE "users" ADD COLUMN "passwordSetTokenHash" TEXT;
ALTER TABLE "users" ADD COLUMN "passwordSetExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "users_passwordSetTokenHash_key" ON "users"("passwordSetTokenHash");
