-- CreateTable
CREATE TABLE "OfficialGroupStanding" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialGroupStanding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialThirdPlaceRanking" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialThirdPlaceRanking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfficialGroupStanding_tournamentId_groupId_position_key" ON "OfficialGroupStanding"("tournamentId", "groupId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialGroupStanding_tournamentId_groupId_teamId_key" ON "OfficialGroupStanding"("tournamentId", "groupId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialThirdPlaceRanking_tournamentId_teamId_key" ON "OfficialThirdPlaceRanking"("tournamentId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialThirdPlaceRanking_tournamentId_rank_key" ON "OfficialThirdPlaceRanking"("tournamentId", "rank");

-- AddForeignKey
ALTER TABLE "OfficialGroupStanding" ADD CONSTRAINT "OfficialGroupStanding_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialGroupStanding" ADD CONSTRAINT "OfficialGroupStanding_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialGroupStanding" ADD CONSTRAINT "OfficialGroupStanding_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialThirdPlaceRanking" ADD CONSTRAINT "OfficialThirdPlaceRanking_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialThirdPlaceRanking" ADD CONSTRAINT "OfficialThirdPlaceRanking_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
