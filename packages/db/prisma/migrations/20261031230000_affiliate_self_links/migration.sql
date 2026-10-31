-- Affiliates can hold several links per creator (one per channel or pack).
DROP INDEX IF EXISTS "affiliate_links_affiliateId_creatorId_key";
CREATE INDEX "affiliate_links_affiliateId_creatorId_idx" ON "affiliate_links"("affiliateId", "creatorId");
ALTER TABLE "affiliate_links" ADD COLUMN "packId" TEXT;
ALTER TABLE "affiliate_links" ADD COLUMN "label" TEXT;
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_packId_fkey" FOREIGN KEY ("packId") REFERENCES "content_packs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
