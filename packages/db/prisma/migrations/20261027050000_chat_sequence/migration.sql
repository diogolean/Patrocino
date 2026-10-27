ALTER TABLE "conversations" ADD COLUMN "fanId" TEXT;
ALTER TABLE "conversations" ADD COLUMN "creatorId" TEXT;

CREATE UNIQUE INDEX "conversations_fanId_creatorId_key" ON "conversations"("fanId", "creatorId");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD COLUMN "offerPostId" TEXT;

CREATE INDEX "messages_offerPostId_idx" ON "messages"("offerPostId");

ALTER TABLE "messages" ADD CONSTRAINT "messages_offerPostId_fkey" FOREIGN KEY ("offerPostId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "chat_sequences" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_sequences_creatorId_key" ON "chat_sequences"("creatorId");

ALTER TABLE "chat_sequences" ADD CONSTRAINT "chat_sequences_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_sequence_steps" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "offerMode" TEXT NOT NULL DEFAULT 'none',
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sequence_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_sequence_steps_sequenceId_position_key" ON "chat_sequence_steps"("sequenceId", "position");
CREATE INDEX "chat_sequence_steps_postId_idx" ON "chat_sequence_steps"("postId");

ALTER TABLE "chat_sequence_steps" ADD CONSTRAINT "chat_sequence_steps_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "chat_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_sequence_steps" ADD CONSTRAINT "chat_sequence_steps_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "chat_sequence_jobs" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sequence_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_sequence_jobs_subscriptionId_position_key" ON "chat_sequence_jobs"("subscriptionId", "position");
CREATE INDEX "chat_sequence_jobs_status_runAt_idx" ON "chat_sequence_jobs"("status", "runAt");

ALTER TABLE "chat_sequence_jobs" ADD CONSTRAINT "chat_sequence_jobs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
