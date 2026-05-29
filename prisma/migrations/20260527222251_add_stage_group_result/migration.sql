-- CreateTable
CREATE TABLE "StageGroupResult" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "standings" JSONB NOT NULL,
    "thirdPlace" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageGroupResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StageGroupResult_stageId_key" ON "StageGroupResult"("stageId");

-- AddForeignKey
ALTER TABLE "StageGroupResult" ADD CONSTRAINT "StageGroupResult_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
