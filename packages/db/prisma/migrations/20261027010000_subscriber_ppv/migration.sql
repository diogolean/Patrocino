ALTER TYPE "ContentVisibility" ADD VALUE 'SUBSCRIBER_PPV';

ALTER TABLE "creators" ADD COLUMN "defaultVideoPriceCents" INTEGER NOT NULL DEFAULT 100;

ALTER TABLE "posts" ADD COLUMN "contentHash" TEXT;

CREATE UNIQUE INDEX "posts_creatorId_contentHash_key" ON "posts"("creatorId", "contentHash");
