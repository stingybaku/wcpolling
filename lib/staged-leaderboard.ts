import { prisma } from "@/lib/prisma";
import { normalizeAnswer } from "@/lib/tiebreaker";

export type StagedLeaderboardEntry = {
  userId: string;
  userName: string | null;
  userImage: string | null;
  totalPoints: number;
  totalCorrectPicks: number;
  badges: { slug: string; icon: string | null }[];
  stages: { stageId: string; stageName: string; stageStatus: string; points: number; correctPicks: number }[];
};

/**
 * Computes the ranked leaderboard for a staged tournament within a group.
 * Ordering: total points, then total correct picks, then tie-breaker distance
 * (closest numeric guess / admin-accepted text answer wins). Only active members
 * with at least one StageScore appear. Shared by the group leaderboard API and
 * the member dashboard so both rank staged tournaments identically.
 */
export async function computeStagedLeaderboard(
  groupId: string,
  tournamentId: string
): Promise<StagedLeaderboardEntry[]> {
  const stages = await prisma.tournamentStage.findMany({
    where: { tournamentId, status: { in: ["OPEN", "CLOSED", "SCORED"] } },
    select: { id: true, name: true, status: true },
  });

  if (stages.length === 0) return [];

  const stageIds = stages.map((s) => s.id);
  const stageNameMap = Object.fromEntries(stages.map((s) => [s.id, s.name]));
  const stageStatusMap = Object.fromEntries(stages.map((s) => [s.id, s.status]));

  const activeMembers = await prisma.groupMembership.findMany({
    where: { groupId, isActive: true },
    select: { userId: true },
  });
  const activeMemberIds = activeMembers.map((m) => m.userId);

  const [scores, tieBreakers, tbAnswers, badgeRows] = await Promise.all([
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
    prisma.userBadge.findMany({
      where: { groupId, userId: { in: activeMemberIds } },
      orderBy: { awardedAt: "asc" },
      select: { userId: true, badge: { select: { slug: true, icon: true } } },
    }),
  ]);

  // Distinct badges per user (a badge type earned in several stages shows once).
  const badgesByUser = new Map<string, { slug: string; icon: string | null }[]>();
  for (const row of badgeRows) {
    const list = badgesByUser.get(row.userId) ?? [];
    if (!list.some((b) => b.slug === row.badge.slug)) {
      list.push({ slug: row.badge.slug, icon: row.badge.icon });
    }
    badgesByUser.set(row.userId, list);
  }

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

  return Object.values(byUser)
    .sort((a, b) =>
      b.totalPoints - a.totalPoints ||
      b.totalCorrectPicks - a.totalCorrectPicks ||
      (distanceByUser.get(a.userId) ?? 0) - (distanceByUser.get(b.userId) ?? 0)
    )
    .map(({ stageMap, ...rest }) => ({
      ...rest,
      badges: badgesByUser.get(rest.userId) ?? [],
      stages: Object.values(stageMap),
    }));
}
