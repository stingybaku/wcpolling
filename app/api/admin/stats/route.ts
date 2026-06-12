import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

// Admin usage dashboard. Everything here is derived from real activity
// timestamps (sessions use the JWT strategy, so there is no login table for
// classic DAU — prediction activity is the meaningful engagement signal).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role !== "ADMIN") return forbidden("Admin only");

  const DAYS = 14;
  const since = new Date();
  since.setDate(since.getDate() - (DAYS - 1));
  since.setHours(0, 0, 0, 0);

  const [
    users,
    approvedGroups,
    pendingGroups,
    rejectedGroups,
    activeMemberships,
    stagedSubmitted,
    classicSubmitted,
    stagedPredictors,
    classicPredictors,
    stages,
    activeMembers,
    stagePredictionUsers,
    recentStaged,
    recentClassic,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.groupRoom.count({ where: { status: "APPROVED" } }),
    prisma.groupRoom.count({ where: { status: "PENDING" } }),
    prisma.groupRoom.count({ where: { status: "REJECTED" } }),
    prisma.groupMembership.count({ where: { isActive: true } }),
    prisma.stagePrediction.count({ where: { submittedAt: { not: null } } }),
    prisma.predictionSubmission.count(),
    prisma.stagePrediction.findMany({ where: { submittedAt: { not: null } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.predictionSubmission.findMany({ select: { userId: true }, distinct: ["userId"] }),
    prisma.tournamentStage.findMany({
      where: { status: { in: ["OPEN", "CLOSED", "SCORED"] } },
      orderBy: [{ tournamentId: "asc" }, { order: "asc" }],
      select: { id: true, name: true, order: true, tournament: { select: { name: true } } },
    }),
    // Eligible audience per tournament: distinct active members of its groups.
    prisma.groupMembership.findMany({
      where: { isActive: true },
      select: { userId: true, group: { select: { tournamentId: true } } },
    }),
    // Who actually submitted, per stage (distinct users).
    prisma.stagePrediction.findMany({
      where: { submittedAt: { not: null } },
      select: { userId: true, stageId: true, stage: { select: { tournamentId: true } } },
      distinct: ["userId", "stageId"],
    }),
    prisma.stagePrediction.findMany({ where: { submittedAt: { gte: since } }, select: { submittedAt: true } }),
    prisma.predictionSubmission.findMany({ where: { submittedAt: { gte: since } }, select: { submittedAt: true } }),
  ]);

  // Distinct users who have ever submitted any prediction (staged or classic).
  const predictorIds = new Set<string>();
  for (const p of stagedPredictors) predictorIds.add(p.userId);
  for (const p of classicPredictors) predictorIds.add(p.userId);

  // Eligible audience per tournament.
  const eligibleByTournament = new Map<string, Set<string>>();
  for (const m of activeMembers) {
    const tid = m.group.tournamentId;
    if (!tid) continue;
    if (!eligibleByTournament.has(tid)) eligibleByTournament.set(tid, new Set());
    eligibleByTournament.get(tid)!.add(m.userId);
  }

  // Distinct predictors per stage.
  const predictedByStage = new Map<string, Set<string>>();
  const tournamentByStage = new Map<string, string>();
  for (const p of stagePredictionUsers) {
    tournamentByStage.set(p.stageId, p.stage.tournamentId);
    if (!predictedByStage.has(p.stageId)) predictedByStage.set(p.stageId, new Set());
    predictedByStage.get(p.stageId)!.add(p.userId);
  }

  const stageParticipation = stages.map((s) => {
    const predicted = predictedByStage.get(s.id)?.size ?? 0;
    const tid = tournamentByStage.get(s.id);
    const eligible = tid ? eligibleByTournament.get(tid)?.size ?? 0 : 0;
    return {
      stageId: s.id,
      name: s.name,
      tournament: s.tournament?.name ?? "",
      predicted,
      eligible,
      pct: eligible > 0 ? Math.round((predicted / eligible) * 100) : 0,
    };
  });

  // Daily activity buckets (local date keys) over the window.
  const dayCounts = new Map<string, number>();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    dayCounts.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of [...recentStaged, ...recentClassic]) {
    if (!row.submittedAt) continue;
    const key = new Date(row.submittedAt).toISOString().slice(0, 10);
    if (dayCounts.has(key)) dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }
  const daily = [...dayCounts.entries()].map(([date, count]) => ({ date, count }));

  return new Response(
    JSON.stringify({
      totals: {
        users,
        approvedGroups,
        pendingGroups,
        rejectedGroups,
        activeMemberships,
        predictionsSubmitted: stagedSubmitted + classicSubmitted,
        activePredictors: predictorIds.size,
      },
      stageParticipation,
      daily,
    }),
    { status: 200 }
  );
}
