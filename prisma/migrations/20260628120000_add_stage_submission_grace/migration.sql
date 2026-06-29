-- CreateTable
CREATE TABLE "StageSubmissionGrace" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "StageSubmissionGrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StageSubmissionGrace_userId_stageId_groupId_key" ON "StageSubmissionGrace"("userId", "stageId", "groupId");

-- AddForeignKey
ALTER TABLE "StageSubmissionGrace" ADD CONSTRAINT "StageSubmissionGrace_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageSubmissionGrace" ADD CONSTRAINT "StageSubmissionGrace_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageSubmissionGrace" ADD CONSTRAINT "StageSubmissionGrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
