import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

const ROUND_POINTS: Record<string, number> = {
  R32: 3,
  R16: 5,
  QF: 7,
  SF: 10,
  Final: 15,
};

export async function POST(_request: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  if (stage.status !== "CLOSED") {
    return new Response(
      JSON.stringify({ error: "Stage must be CLOSED to compute scores" }),
      { status: 409 }
    );
  }

  const groups = await prisma.groupRoom.findMany({
    where: { tournamentId: stage.tournamentId },
  });

  if (stage.type === "GROUP_QUALIFICATION") {
    const qualificationResult = await prisma.stageQualificationResult.findUnique({
      where: { stageId },
    });

    if (!qualificationResult) {
      return new Response(
        JSON.stringify({ error: "No qualification results found for this stage. Enter results first." }),
        { status: 409 }
      );
    }

    const qualifierTeamIds = new Set(qualificationResult.qualifiers as string[]);

    for (const group of groups) {
      const members = await prisma.groupMembership.findMany({
        where: { groupId: group.id, isActive: true },
      });

      for (const member of members) {
        const prediction = await prisma.stagePrediction.findFirst({
          where: {
            stageId,
            groupId: group.id,
            userId: member.userId,
          },
        });

        let correctPicks = 0;
        let incorrectPicks = 0;
        const total = 32;

        if (prediction && prediction.qualificationPicks) {
          const picks = prediction.qualificationPicks as string[];
          for (const teamId of picks) {
            if (qualifierTeamIds.has(teamId)) {
              correctPicks++;
            } else {
              incorrectPicks++;
            }
          }
        }

        const points = correctPicks * 2;

        await prisma.stageScore.upsert({
          where: {
            userId_stageId_groupId: {
              stageId,
              userId: member.userId,
              groupId: group.id,
            },
          },
          create: {
            stageId,
            userId: member.userId,
            groupId: group.id,
            points,
            correctPicks,
            breakdown: { correct: correctPicks, incorrect: incorrectPicks, total },
          },
          update: {
            points,
            correctPicks,
            breakdown: { correct: correctPicks, incorrect: incorrectPicks, total },
          },
        });
      }
    }
  } else if (stage.type === "KNOCKOUT") {
    const pointsPerRound = stage.roundLabel ? (ROUND_POINTS[stage.roundLabel] ?? 0) : 0;

    const stageMatches = await prisma.stageMatch.findMany({
      where: { stageId, winnerId: { not: null } },
    });

    const winnerMap = new Map<string, string>();
    for (const match of stageMatches) {
      if (match.winnerId) {
        winnerMap.set(match.id, match.winnerId);
      }
    }

    for (const group of groups) {
      const members = await prisma.groupMembership.findMany({
        where: { groupId: group.id, isActive: true },
      });

      for (const member of members) {
        const prediction = await prisma.stagePrediction.findFirst({
          where: {
            stageId,
            groupId: group.id,
            userId: member.userId,
          },
        });

        let correctPicks = 0;

        if (prediction && prediction.matchPicks) {
          const picks = prediction.matchPicks as Array<{ matchId: string; winnerId: string }>;
          for (const pick of picks) {
            const realWinnerId = winnerMap.get(pick.matchId);
            if (realWinnerId && realWinnerId === pick.winnerId) {
              correctPicks++;
            }
          }
        }

        const points = correctPicks * pointsPerRound;

        await prisma.stageScore.upsert({
          where: {
            userId_stageId_groupId: {
              stageId,
              userId: member.userId,
              groupId: group.id,
            },
          },
          create: {
            stageId,
            userId: member.userId,
            groupId: group.id,
            points,
            correctPicks,
            breakdown: { correctPicks, pointsPerRound, roundLabel: stage.roundLabel },
          },
          update: {
            points,
            correctPicks,
            breakdown: { correctPicks, pointsPerRound, roundLabel: stage.roundLabel },
          },
        });
      }
    }
  } else {
    return new Response(JSON.stringify({ error: "Unsupported stage type for scoring" }), { status: 400 });
  }

  await prisma.tournamentStage.update({
    where: { id: stageId },
    data: { status: "SCORED" },
  });

  return new Response(JSON.stringify({ scored: true, stageId }), { status: 200 });
}
