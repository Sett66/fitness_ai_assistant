ALTER TABLE "AiRun"
ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "AiRun_clientRequestId_key"
ON "AiRun"("clientRequestId");

CREATE INDEX "AiRun_conversationId_taskType_status_idx"
ON "AiRun"("conversationId", "taskType", "status");

CREATE UNIQUE INDEX "AiRun_one_active_coach_chat_per_conversation_key"
ON "AiRun"("conversationId")
WHERE "taskType" = 'COACH_CHAT' AND "status" IN ('QUEUED', 'RUNNING');
