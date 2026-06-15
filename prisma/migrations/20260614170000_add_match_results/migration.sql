-- CreateEnum
CREATE TYPE "MatchRound" AS ENUM ('GROUP', 'R32', 'R16', 'QF', 'SF', 'FINAL');

-- CreateEnum
CREATE TYPE "MatchResultStatus" AS ENUM ('SCHEDULED', 'FINISHED');

-- CreateEnum
CREATE TYPE "TieBreakerMetric" AS ENUM ('TOTAL_GOALS', 'FINAL_GOALS', 'PENALTY_SHOOTOUTS', 'RED_CARDS');

-- AlterTable
ALTER TABLE "TieBreakerQuestion" ADD COLUMN "metric" "TieBreakerMetric";

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" "MatchRound" NOT NULL,
    "groupName" TEXT,
    "matchNumber" INTEGER NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "stageMatchId" TEXT,
    "kickoffAt" TIMESTAMP(3),
    "venue" TEXT,
    "status" "MatchResultStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "homeYellow" INTEGER NOT NULL DEFAULT 0,
    "awayYellow" INTEGER NOT NULL DEFAULT 0,
    "homeRed" INTEGER NOT NULL DEFAULT 0,
    "awayRed" INTEGER NOT NULL DEFAULT 0,
    "penaltyShootout" BOOLEAN NOT NULL DEFAULT false,
    "homePenalties" INTEGER,
    "awayPenalties" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_stageMatchId_key" ON "MatchResult"("stageMatchId");

-- CreateIndex
CREATE INDEX "MatchResult_tournamentId_idx" ON "MatchResult"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_tournamentId_round_groupName_matchNumber_key" ON "MatchResult"("tournamentId", "round", "groupName", "matchNumber");

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_stageMatchId_fkey" FOREIGN KEY ("stageMatchId") REFERENCES "StageMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
