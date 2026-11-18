-- AlterTable
ALTER TABLE "posts" ADD COLUMN "featuredRank" INTEGER;

-- CreateIndex
CREATE INDEX "posts_creatorId_featuredRank_idx" ON "posts"("creatorId", "featuredRank");
