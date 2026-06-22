-- AlterTable
-- New groups default to the free tier (20). Existing rooms are backfilled to 100
-- (the previous global MAX_GROUP_MEMBERS) so no live group is retroactively
-- pushed over its cap; the new 20 default only applies to rooms created after
-- this migration.
ALTER TABLE "GroupRoom" ADD COLUMN "memberCap" INTEGER NOT NULL DEFAULT 20;
UPDATE "GroupRoom" SET "memberCap" = 100;

-- CreateTable
CREATE TABLE "GroupUpgrade" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "memberCap" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "purchasedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupUpgrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupUpgrade_stripeSessionId_key" ON "GroupUpgrade"("stripeSessionId");

-- CreateIndex
CREATE INDEX "GroupUpgrade_groupId_idx" ON "GroupUpgrade"("groupId");

-- AddForeignKey
ALTER TABLE "GroupUpgrade" ADD CONSTRAINT "GroupUpgrade_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
