-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('GPS', 'MANUAL', 'GEOCODE');

-- CreateTable
CREATE TABLE "UserLocationSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "city" VARCHAR(64),
    "source" "LocationSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLocationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserLocationSnapshot_userId_createdAt_idx" ON "UserLocationSnapshot"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserLocationSnapshot" ADD CONSTRAINT "UserLocationSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
