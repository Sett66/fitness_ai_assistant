-- AlterEnum
ALTER TYPE "AiTaskType" ADD VALUE 'MEMORY_EXTRACT';

-- CreateTable
CREATE TABLE "UserAgentMemory" (
    "userId" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" VARCHAR(512) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "sourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAgentMemory_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE INDEX "UserAgentMemory_userId_updatedAt_idx" ON "UserAgentMemory"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "UserAgentMemory" ADD CONSTRAINT "UserAgentMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
