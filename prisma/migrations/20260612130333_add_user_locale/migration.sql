-- AlterTable: per-user preferred language for UI default and email localization.
-- Existing rows default to 'en'; the app backfills each user's actual choice on
-- their next authenticated page load.
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
