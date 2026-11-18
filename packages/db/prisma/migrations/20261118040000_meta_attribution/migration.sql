-- First-touch UTM on the account, the subscription, and the purchase. Nullable. No existing rows change.
ALTER TABLE "users" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "users" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "users" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "users" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "users" ADD COLUMN "utmTerm" TEXT;

ALTER TABLE "subscriptions" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "utmTerm" TEXT;

ALTER TABLE "purchases" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "purchases" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "purchases" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "purchases" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "purchases" ADD COLUMN "utmTerm" TEXT;
ALTER TABLE "purchases" ADD COLUMN "fbp" TEXT;
ALTER TABLE "purchases" ADD COLUMN "fbc" TEXT;
ALTER TABLE "purchases" ADD COLUMN "clientIp" TEXT;
ALTER TABLE "purchases" ADD COLUMN "clientUserAgent" TEXT;
ALTER TABLE "purchases" ADD COLUMN "metaCapiSentAt" TIMESTAMP(3);
