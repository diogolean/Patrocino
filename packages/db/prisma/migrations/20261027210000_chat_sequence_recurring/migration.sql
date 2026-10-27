ALTER TABLE "chat_sequence_steps" ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "chat_sequence_jobs" ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 0;
