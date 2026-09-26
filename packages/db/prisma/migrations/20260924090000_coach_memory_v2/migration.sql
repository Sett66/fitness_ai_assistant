-- Preserve existing memory rows while replacing the composite primary key.
CREATE TYPE "MemoryCategory" AS ENUM ('injury', 'diet_restriction', 'diet_pref', 'equipment', 'schedule', 'location', 'goal_note', 'other');
CREATE TYPE "MemoryEventAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');
CREATE TYPE "MemoryEventActor" AS ENUM ('AGENT', 'USER', 'SYSTEM');
ALTER TYPE "AiTaskType" ADD VALUE IF NOT EXISTS 'MEMORY_PERSIST';

ALTER TABLE "UserAgentMemory" ADD COLUMN "id" TEXT;
ALTER TABLE "UserAgentMemory" ADD COLUMN "category" "MemoryCategory";
ALTER TABLE "UserAgentMemory" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "UserAgentMemory" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "UserAgentMemory" ADD COLUMN "hitCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserAgentMemory" ADD COLUMN "embeddedAt" TIMESTAMP(3);
ALTER TABLE "UserAgentMemory" ALTER COLUMN "key" TYPE VARCHAR(80);

-- Legacy keys are deterministically converted to category:snake_case.
UPDATE "UserAgentMemory"
SET "category" = CASE
  WHEN "key" ~ '^injury_' THEN 'injury'::"MemoryCategory"
  WHEN "key" ~ '^diet_no_' THEN 'diet_restriction'::"MemoryCategory"
  WHEN "key" ~ '^diet_' THEN 'diet_pref'::"MemoryCategory"
  WHEN "key" ~ '^equipment_' THEN 'equipment'::"MemoryCategory"
  WHEN "key" ~ '^travel_' THEN 'location'::"MemoryCategory"
  WHEN "key" ~ '^schedule_' THEN 'schedule'::"MemoryCategory"
  WHEN "key" ~ '^goal_' THEN 'goal_note'::"MemoryCategory"
  ELSE 'other'::"MemoryCategory"
END;

UPDATE "UserAgentMemory"
SET "key" = lower(regexp_replace("key", '[^a-zA-Z0-9]+', '_', 'g'));
UPDATE "UserAgentMemory"
SET "key" = regexp_replace("key", '^_+|_+$', '', 'g');
UPDATE "UserAgentMemory"
SET "key" = CASE "category"
  WHEN 'injury' THEN 'injury:' || left(nullif(regexp_replace("key", '^injury_', ''), ''), 48)
  WHEN 'diet_restriction' THEN 'diet_restriction:' || left(nullif(regexp_replace("key", '^diet_no_', ''), ''), 48)
  WHEN 'diet_pref' THEN 'diet_pref:' || left(nullif(regexp_replace("key", '^diet_', ''), ''), 48)
  WHEN 'equipment' THEN 'equipment:' || left(nullif(regexp_replace("key", '^equipment_', ''), ''), 48)
  WHEN 'location' THEN 'location:' || left(nullif(regexp_replace("key", '^travel_', ''), ''), 48)
  WHEN 'schedule' THEN 'schedule:' || left(nullif(regexp_replace("key", '^schedule_', ''), ''), 48)
  WHEN 'goal_note' THEN 'goal_note:' || left(nullif(regexp_replace("key", '^goal_', ''), ''), 48)
  ELSE 'other:' || left(nullif("key", ''), 48)
END;
UPDATE "UserAgentMemory" SET "key" = regexp_replace("key", ':$', ':legacy') WHERE "key" LIKE '%:';
-- Preserve collisions rather than dropping legacy facts.  Newer row keeps the canonical key.
WITH ranked AS (
  SELECT ctid, "category", "key", row_number() OVER (PARTITION BY "userId", "key" ORDER BY "updatedAt" DESC) AS rn
  FROM "UserAgentMemory"
)
UPDATE "UserAgentMemory" m
SET "key" = split_part(r."key", ':', 1) || ':' || left(split_part(r."key", ':', 2), 45) || '_' || r.rn
FROM ranked r
WHERE m.ctid = r.ctid AND r.rn > 1;
UPDATE "UserAgentMemory" SET "id" = md5(random()::text || clock_timestamp()::text || "userId" || "key");

ALTER TABLE "UserAgentMemory" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "UserAgentMemory" ALTER COLUMN "category" SET NOT NULL;
ALTER TABLE "UserAgentMemory" DROP CONSTRAINT "UserAgentMemory_pkey";
ALTER TABLE "UserAgentMemory" ADD CONSTRAINT "UserAgentMemory_pkey" PRIMARY KEY ("id");
ALTER TABLE "UserAgentMemory" ADD CONSTRAINT "UserAgentMemory_userId_key_key" UNIQUE ("userId", "key");
CREATE INDEX "UserAgentMemory_userId_category_deletedAt_idx" ON "UserAgentMemory"("userId", "category", "deletedAt");

CREATE TABLE "UserAgentMemoryEvent" (
  "id" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "action" "MemoryEventAction" NOT NULL,
  "valueSnapshot" VARCHAR(512) NOT NULL,
  "actor" "MemoryEventActor" NOT NULL,
  "sourceRunId" TEXT,
  "sourceMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAgentMemoryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserAgentMemoryEvent_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "UserAgentMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserAgentMemoryEvent_memoryId_createdAt_idx" ON "UserAgentMemoryEvent"("memoryId", "createdAt");
INSERT INTO "UserAgentMemoryEvent" ("id", "memoryId", "action", "valueSnapshot", "actor")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", 'CREATE', "value", 'SYSTEM' FROM "UserAgentMemory";
