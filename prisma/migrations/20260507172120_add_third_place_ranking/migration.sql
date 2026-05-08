-- CreateTable
CREATE TABLE "PredictionThirdPlaceRanking" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionThirdPlaceRanking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PredictionThirdPlaceRanking_predictionId_teamId_key" ON "PredictionThirdPlaceRanking"("predictionId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionThirdPlaceRanking_predictionId_rank_key" ON "PredictionThirdPlaceRanking"("predictionId", "rank");

-- AddForeignKey
ALTER TABLE "PredictionThirdPlaceRanking" ADD CONSTRAINT "PredictionThirdPlaceRanking_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionThirdPlaceRanking" ADD CONSTRAINT "PredictionThirdPlaceRanking_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
