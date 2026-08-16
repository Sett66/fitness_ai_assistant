-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AiTaskType" ADD VALUE 'SOCIAL_MODERATE';

-- DropIndex
DROP INDEX "Comment_postId_createdAt_idx";

-- DropIndex
DROP INDEX "Post_visibility_createdAt_idx";

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "moderation" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "moderationReason" TEXT;

-- CreateIndex
CREATE INDEX "Comment_postId_deletedAt_createdAt_idx" ON "Comment"("postId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Post_visibility_moderation_createdAt_idx" ON "Post"("visibility", "moderation", "createdAt");
