-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
-- Existing rooms default to APPROVED so they keep working; new non-admin
-- rooms are inserted as PENDING by the application layer.
ALTER TABLE "GroupRoom" ADD COLUMN "status" "GroupStatus" NOT NULL DEFAULT 'APPROVED';
