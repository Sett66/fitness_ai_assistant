-- User: displayName + avatar
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarMediaId" TEXT;

-- StrengthLevel: replace enum exercise with exerciseId FK
DROP INDEX IF EXISTS "StrengthLevel_userId_exercise_recordedAt_idx";

-- Clear legacy rows (enum → exerciseId cannot auto-map)
DELETE FROM "StrengthLevel";

ALTER TABLE "StrengthLevel" DROP COLUMN "exercise";
ALTER TABLE "StrengthLevel" ADD COLUMN "exerciseId" TEXT NOT NULL;
ALTER TABLE "StrengthLevel" ADD COLUMN "workingWeightKg" DOUBLE PRECISION;
ALTER TABLE "StrengthLevel" ALTER COLUMN "oneRm" DROP NOT NULL;

ALTER TABLE "StrengthLevel" ADD CONSTRAINT "StrengthLevel_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "StrengthLevel_userId_exerciseId_key" ON "StrengthLevel"("userId", "exerciseId");
CREATE INDEX "StrengthLevel_userId_recordedAt_idx" ON "StrengthLevel"("userId", "recordedAt");

ALTER TABLE "User" ADD CONSTRAINT "User_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TYPE "StrengthExerciseKind";
