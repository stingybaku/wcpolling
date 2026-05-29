-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "tieBreakerClosedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StageTieBreakerAnswer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageTieBreakerAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StageTieBreakerAnswer_userId_groupId_tournamentId_questionI_key" ON "StageTieBreakerAnswer"("userId", "groupId", "tournamentId", "questionId");

-- AddForeignKey
ALTER TABLE "StageTieBreakerAnswer" ADD CONSTRAINT "StageTieBreakerAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTieBreakerAnswer" ADD CONSTRAINT "StageTieBreakerAnswer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTieBreakerAnswer" ADD CONSTRAINT "StageTieBreakerAnswer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTieBreakerAnswer" ADD CONSTRAINT "StageTieBreakerAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TieBreakerQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
