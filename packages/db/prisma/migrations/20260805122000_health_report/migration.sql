-- CreateTable
CREATE TABLE "HealthReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3),
    "status" "AiTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "sourceMediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pageMediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metrics" JSONB,
    "riskAssessment" JSONB,
    "healthContext" TEXT,
    "aiRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HealthReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthReport_aiRunId_key" ON "HealthReport"("aiRunId");

-- CreateIndex
CREATE INDEX "HealthReport_userId_createdAt_idx" ON "HealthReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "HealthReport_deletedAt_idx" ON "HealthReport"("deletedAt");

-- AddForeignKey
ALTER TABLE "HealthReport" ADD CONSTRAINT "HealthReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthReport" ADD CONSTRAINT "HealthReport_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
