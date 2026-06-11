import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";
import { normalizeAnswer } from "@/lib/tiebreaker";

export async function GET(request: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId } = await context.params;
  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) return badRequest("Missing tournamentId query param");

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!membership) return forbidden("Not a member of this group");

  const stages = await prisma.tournamentStage.findMany({
    where: { tournamentId, status: { in: ["OPEN", "CLOSED", "SCORED"] } },
    select: { id: true, name: true, status: true },
  });

  if (stages.length === 0) {
    return new Response(JSON.stringify({ leaderboard: [] }), { status: 200 });
  }

  const stageIds = stages.map((s) => s.id);
  const stageNameMap = Object.fromEntries(stages.map((s) => [s.id, s.name]));
  const stageStatusMap = Object.fromEntries(stages.map((s) => [s.id, s.status]));

  const activeMembers = await prisma.groupMembership.findMany({
    where: { groupId, isActive: true },
    select: { userId: true },
  });
  const activeMemberIds = activeMembers.map((m) => m.userId);

  const [scores, tieBreakers, tbAnswers] = await Promise.all([
    prisma.stageScore.findMany({
      where: { stageId: { in: stageIds }, groupId, userId: { in: activeMemberIds } },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    }),
    prisma.tieBreakerQuestion.findMany({
      where: { tournamentId },
      select: { id: true, type: true, correctAnswer: true, acceptedAnswers: true },
    }),
    prisma.stageTieBreakerAnswer.findMany({
      where: { tournamentId, groupId, userId: { in: activeMemberIds } },
      select: { userId: true, questionId: true, answer: true },
    }),
  ]);

  // Per-user tie-breaker "distance": lower is better. NUMBER questions reward
  // the closest guess; TEXT questions are graded manually by the admin (a set of
  // accepted normalized answers). Only graded questions count; a missing or
  // incorrect answer takes a large penalty so members who answered correctly
  // always rank above those who did not.
  const TB_PENALTY = 1e9;
  const scorableTieBreakers = tieBreakers.filter((q) =>
    q.type === "NUMBER"
      ? (q.correctAnswer ?? "").trim() !== ""
      : Array.isArray(q.acceptedAnswers) && (q.acceptedAnswers as string[]).length > 0
  );
  const answerMap = new Map<string, string>();
  for (const a of tbAnswers) answerMap.set(`${a.userId}:${a.questionId}`, a.answer);

  function tieBreakerDistance(userId: string): number {
    let distance = 0;
    for (const q of scorableTieBreakers) {
      const given = answerMap.get(`${userId}:${q.id}`)?.trim();
      if (!given) { distance += TB_PENALTY; continue; }
      if (q.type === "NUMBER") {
        const correctNum = Number((q.correctAnswer ?? "").trim());
        const givenNum = Number(given);
        distance += Number.isFinite(givenNum) && Number.isFinite(correctNum)
          ? Math.abs(givenNum - correctNum)
          : TB_PENALTY;
      } else {
        const accepted = new Set(q.acceptedAnswers as string[]);
        distance += accepted.has(normalizeAnswer(given)) ? 0 : TB_PENALTY;
      }
    }
    return distance;
  }

  const byUser: Record<string, {
    userId: string;
    userName: string | null;
    userImage: string | null;
    totalPoints: number;
    totalCorrectPicks: number;
    stageMap: Record<string, { stageId: string; stageName: string; stageStatus: string; points: number; correctPicks: number }>;
  }> = {};

  for (const score of scores) {
    const uid = score.userId;
    if (!byUser[uid]) {
      byUser[uid] = {
        userId: uid,
        userName: score.user.name,
        userImage: score.user.image,
        totalPoints: 0,
        totalCorrectPicks: 0,
        stageMap: {},
      };
    }
    byUser[uid].totalPoints += score.points;
    byUser[uid].totalCorrectPicks += score.correctPicks;
    byUser[uid].stageMap[score.stageId] = {
      stageId: score.stageId,
      stageName: stageNameMap[score.stageId] ?? score.stageId,
      stageStatus: stageStatusMap[score.stageId] ?? "SCORED",
      points: score.points,
      correctPicks: score.correctPicks,
    };
  }

  const distanceByUser = new Map(
    Object.keys(byUser).map((uid) => [uid, tieBreakerDistance(uid)])
  );

  const leaderboard = Object.values(byUser)
    .sort((a, b) =>
      b.totalPoints - a.totalPoints ||
      b.totalCorrectPicks - a.totalCorrectPicks ||
      (distanceByUser.get(a.userId) ?? 0) - (distanceByUser.get(b.userId) ?? 0)
    )
    .map(({ stageMap, ...rest }) => ({
      ...rest,
      stages: Object.values(stageMap),
    }));

  return new Response(JSON.stringify({ leaderboard }), { status: 200 });
}
