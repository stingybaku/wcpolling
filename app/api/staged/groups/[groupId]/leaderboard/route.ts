import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";

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

  const scores = await prisma.stageScore.findMany({
    where: { stageId: { in: stageIds }, groupId, userId: { in: activeMemberIds } },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

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

  const leaderboard = Object.values(byUser)
    .sort((a, b) => b.totalPoints - a.totalPoints || b.totalCorrectPicks - a.totalCorrectPicks)
    .map(({ stageMap, ...rest }) => ({
      ...rest,
      stages: Object.values(stageMap),
    }));

  return new Response(JSON.stringify({ leaderboard }), { status: 200 });
}
