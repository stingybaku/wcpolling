-- CreateEnum
CREATE TYPE "BadgeCategory" AS ENUM ('SKILL', 'CONSISTENCY', 'UNLOCK', 'SOCIAL');

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "BadgeCategory" NOT NULL,
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stageId" TEXT,
    "contextKey" TEXT NOT NULL,
    "params" JSONB,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Badge_slug_key" ON "Badge"("slug");

-- CreateIndex
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");

-- CreateIndex
CREATE INDEX "UserBadge_groupId_tournamentId_idx" ON "UserBadge"("groupId", "tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_groupId_contextKey_key" ON "UserBadge"("userId", "badgeId", "groupId", "contextKey");

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the static badge catalog so it exists in every environment after `migrate deploy`.
-- (Display text lives in the i18n catalogs keyed by slug; only slug/category/icon live here.)
INSERT INTO "Badge" ("id", "slug", "category", "icon", "active") VALUES
  ('badge_clean_sweep',  'clean_sweep',  'SKILL',       '🧹', true),
  ('badge_stage_mvp',    'stage_mvp',    'SKILL',       '🏅', true),
  ('badge_hot_streak',   'hot_streak',   'CONSISTENCY', '🔥', true),
  ('badge_ever_present', 'ever_present', 'CONSISTENCY', '📅', true),
  ('badge_locked_in',    'locked_in',    'UNLOCK',      '🔒', true),
  ('badge_top_of_table', 'top_of_table', 'SOCIAL',      '👑', true)
ON CONFLICT ("slug") DO NOTHING;
