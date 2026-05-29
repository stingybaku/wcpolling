import { prisma } from "@/lib/prisma";

const ROUND_POINTS: Record<string, number> = {
  R32: 3,
  R16: 5,
  QF: 7,
  SF: 10,
  Final: 15,
};

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
          create: { stageId, userId: member.userId, groupId: group.id, points: correctPicks * 2, correctPicks, breakdown: { correct: correctPicks, incorrect: incorrectPicks, total } },
          update: { points: correctPicks * 2, correctPicks, breakdown: { correct: correctPicks, incorrect: incorrectPicks, total } },
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
          for (const pick of prediction.matchPicks as Array<{ matchId: string; winnerId: string }>) {
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
