-- AlterTable
ALTER TABLE "StagePrediction" ADD COLUMN     "lockedOutMatchIds" JSONB,
ADD COLUMN     "unlockedAt" TIMESTAMP(3);
