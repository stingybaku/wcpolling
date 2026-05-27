-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('CLASSIC', 'STAGED');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('GROUP_QUALIFICATION', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('UPCOMING', 'OPEN', 'CLOSED', 'SCORED');

-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('MEMBER', 'GROUP_ADMIN');

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "type" "TournamentType" NOT NULL DEFAULT 'CLASSIC';

-- CreateTable
CREATE TABLE "TournamentStage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "type" "StageType" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'UPCOMING',
    "name" TEXT NOT NULL,
    "roundLabel" TEXT,
    "order" INTEGER NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageMatch" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "matchNumber" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "matchDate" TIMESTAMP(3),
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageQualificationResult" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "qualifiers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageQualificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagePrediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "qualificationPicks" JSONB,
    "matchPicks" JSONB,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "correctPicks" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentStage_tournamentId_order_key" ON "TournamentStage"("tournamentId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "StageMatch_stageId_matchNumber_key" ON "StageMatch"("stageId", "matchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StageQualificationResult_stageId_key" ON "StageQualificationResult"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "StagePrediction_userId_stageId_groupId_key" ON "StagePrediction"("userId", "stageId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "StageScore_userId_stageId_groupId_key" ON "StageScore"("userId", "stageId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_userId_type_refId_key" ON "EmailLog"("userId", "type", "refId");

-- AddForeignKey
ALTER TABLE "TournamentStage" ADD CONSTRAINT "TournamentStage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageMatch" ADD CONSTRAINT "StageMatch_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageMatch" ADD CONSTRAINT "StageMatch_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageMatch" ADD CONSTRAINT "StageMatch_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageMatch" ADD CONSTRAINT "StageMatch_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageQualificationResult" ADD CONSTRAINT "StageQualificationResult_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePrediction" ADD CONSTRAINT "StagePrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePrediction" ADD CONSTRAINT "StagePrediction_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePrediction" ADD CONSTRAINT "StagePrediction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageScore" ADD CONSTRAINT "StageScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageScore" ADD CONSTRAINT "StageScore_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageScore" ADD CONSTRAINT "StageScore_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
