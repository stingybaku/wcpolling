-- CreateTable
CREATE TABLE "TriviaQuestion" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "publishDate" DATE NOT NULL,
    "prompt" JSONB NOT NULL,
    "options" JSONB NOT NULL,
    "correctKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriviaQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaAnswer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerKey" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriviaAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT 'triviador',
    "streakLength" INTEGER NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriviaAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TriviaQuestion_tournamentId_idx" ON "TriviaQuestion"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TriviaQuestion_tournamentId_publishDate_key" ON "TriviaQuestion"("tournamentId", "publishDate");

-- CreateIndex
CREATE INDEX "TriviaAnswer_userId_idx" ON "TriviaAnswer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TriviaAnswer_userId_questionId_key" ON "TriviaAnswer"("userId", "questionId");

-- CreateIndex
CREATE INDEX "TriviaAchievement_userId_idx" ON "TriviaAchievement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TriviaAchievement_userId_tournamentId_slug_key" ON "TriviaAchievement"("userId", "tournamentId", "slug");

-- AddForeignKey
ALTER TABLE "TriviaQuestion" ADD CONSTRAINT "TriviaQuestion_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaAnswer" ADD CONSTRAINT "TriviaAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaAnswer" ADD CONSTRAINT "TriviaAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TriviaQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaAchievement" ADD CONSTRAINT "TriviaAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaAchievement" ADD CONSTRAINT "TriviaAchievement_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
