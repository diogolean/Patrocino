ALTER TABLE "messages" ADD COLUMN "readAt" TIMESTAMP(3);

CREATE INDEX "messages_conversationId_readAt_idx" ON "messages"("conversationId", "readAt");
