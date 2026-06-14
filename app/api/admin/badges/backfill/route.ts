import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { evaluateStageBadges, evaluateTournamentBadges } from "@/lib/badges";

/**
 * Retroactively awards badges from existing data. Re-runnable (evaluators are
 * idempotent). Run once after deploying the badges feature.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role !== "ADMIN") return forbidden("Admin only");

  const scoredStages = await prisma.tournamentStage.findMany({
    where: { status: "SCORED" },
    select: { id: true },
  });
  for (const s of scoredStages) {
    await evaluateStageBadges(s.id);
  }

  const finalized = await prisma.tournament.findMany({
    where: { type: "STAGED", finalizedAt: { not: null } },
    select: { id: true },
  });
  for (const t of finalized) {
    await evaluateTournamentBadges(t.id);
  }

  const totalBadges = await prisma.userBadge.count();
  return Response.json({
    backfilled: true,
    stagesEvaluated: scoredStages.length,
    tournamentsEvaluated: finalized.length,
    totalBadges,
  });
}
