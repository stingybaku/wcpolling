import { prisma } from "@/lib/prisma";

/**
 * Promotes unsubmitted drafts into submissions for a stage. A "draft" is a
 * StagePrediction with picks saved but no `submittedAt`. When a stage closes
 * (and before scoring), a member who saved picks but never hit submit should
 * still be scored and count as having participated — so their draft becomes the
 * submission. Members with no prediction, or an empty draft, are left untouched
 * and therefore score nothing.
 *
 * Only ever called once a stage is CLOSED, so it never auto-submits picks while
 * the stage is still open. Idempotent — re-running affects nothing new.
 *
 * Returns the number of drafts promoted.
 */
export async function promoteDraftsToSubmissions(stageId: string): Promise<number> {
  const stage = await prisma.tournamentStage.findUnique({
    where: { id: stageId },
    select: { type: true },
  });
  if (!stage) return 0;

  const drafts = await prisma.stagePrediction.findMany({
    where: { stageId, submittedAt: null },
    select: { id: true, qualificationPicks: true, matchPicks: true },
  });

  const toPromote = drafts
    .filter((d) => {
      const picks = stage.type === "GROUP_QUALIFICATION" ? d.qualificationPicks : d.matchPicks;
      return Array.isArray(picks) && picks.length > 0;
    })
    .map((d) => d.id);

  if (toPromote.length === 0) return 0;

  await prisma.stagePrediction.updateMany({
    where: { id: { in: toPromote } },
    data: { submittedAt: new Date() },
  });
  return toPromote.length;
}

/**
 * Points awarded per correct knockout pick, keyed by round. Exported so the
 * audit view computes points exactly the way the scorer does (single source of
 * truth — if these change, both stay in sync).
 */
export const ROUND_POINTS: Record<string, number> = {
  R32: 3,
  R16: 5,
  QF: 7,
  SF: 10,
  Final: 15,
};

/** Points awarded per correct Group-Qualification pick. */
export const QUALIFICATION_POINTS_PER_CORRECT = 2;

/**
 * Computes and persists StageScore records for all group members without
 * changing the stage status. Safe to call repeatedly as results change.
 */
export async function scoreStage(stageId: string): Promise<void> {
  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) return;

  const groups = await prisma.groupRoom.findMany({
    where: { tournamentId: stage.tournamentId },
  });

  if (stage.type === "GROUP_QUALIFICATION") {
    const qualificationResult = await prisma.stageQualificationResult.findUnique({ where: { stageId } });
    if (!qualificationResult) return;

    const qualifierTeamIds = new Set(qualificationResult.qualifiers as string[]);

    for (const group of groups) {
      const members = await prisma.groupMembership.findMany({
        where: { groupId: group.id, isActive: true },
      });
      for (const member of members) {
        const prediction = await prisma.stagePrediction.findFirst({
          where: { stageId, groupId: group.id, userId: member.userId, submittedAt: { not: null } },
        });

        let correctPicks = 0;
        let incorrectPicks = 0;
        const total = 32;

        if (prediction?.qualificationPicks) {
          for (const teamId of prediction.qualificationPicks as string[]) {
            if (qualifierTeamIds.has(teamId)) correctPicks++;
            else incorrectPicks++;
          }
        }

        await prisma.stageScore.upsert({
          where: { userId_stageId_groupId: { stageId, userId: member.userId, groupId: group.id } },
          create: { stageId, userId: member.userId, groupId: group.id, points: correctPicks * QUALIFICATION_POINTS_PER_CORRECT, correctPicks, breakdown: { correct: correctPicks, incorrect: incorrectPicks, total } },
          update: { points: correctPicks * QUALIFICATION_POINTS_PER_CORRECT, correctPicks, breakdown: { correct: correctPicks, incorrect: incorrectPicks, total } },
        });
      }
    }
  } else if (stage.type === "KNOCKOUT") {
    const pointsPerRound = stage.roundLabel ? (ROUND_POINTS[stage.roundLabel] ?? 0) : 0;
    const stageMatches = await prisma.stageMatch.findMany({ where: { stageId, winnerId: { not: null } } });
    const winnerMap = new Map(stageMatches.filter(m => m.winnerId).map(m => [m.id, m.winnerId!]));

    for (const group of groups) {
      const members = await prisma.groupMembership.findMany({
        where: { groupId: group.id, isActive: true },
      });
      for (const member of members) {
        const prediction = await prisma.stagePrediction.findFirst({
          where: { stageId, groupId: group.id, userId: member.userId, submittedAt: { not: null } },
        });

        let correctPicks = 0;
        if (prediction?.matchPicks) {
          const lockedOut = new Set(
            Array.isArray(prediction.lockedOutMatchIds) ? (prediction.lockedOutMatchIds as string[]) : []
          );
          for (const pick of prediction.matchPicks as Array<{ matchId: string; winnerId: string }>) {
            if (lockedOut.has(pick.matchId)) continue;
            if (winnerMap.get(pick.matchId) === pick.winnerId) correctPicks++;
          }
        }

        await prisma.stageScore.upsert({
          where: { userId_stageId_groupId: { stageId, userId: member.userId, groupId: group.id } },
          create: { stageId, userId: member.userId, groupId: group.id, points: correctPicks * pointsPerRound, correctPicks, breakdown: { correctPicks, pointsPerRound, roundLabel: stage.roundLabel } },
          update: { points: correctPicks * pointsPerRound, correctPicks, breakdown: { correctPicks, pointsPerRound, roundLabel: stage.roundLabel } },
        });
      }
    }
  }
}
