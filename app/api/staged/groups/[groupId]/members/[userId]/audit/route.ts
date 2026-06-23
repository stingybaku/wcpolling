import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";
import { ROUND_POINTS, QUALIFICATION_POINTS_PER_CORRECT } from "@/lib/stage-scoring";

type RouteContext = { params: Promise<{ groupId: string; userId: string }> };

type TeamRef = { teamId: string; name: string; fifaCode: string };

/**
 * Audit data for a single group member's staged predictions.
 *
 * For each stage the member has a prediction or score in, returns their picks
 * next to the actual tournament results, plus the points the scorer *would*
 * compute (mirroring lib/stage-scoring) alongside the stored StageScore — so a
 * group admin can verify the points were calculated correctly.
 *
 * Read-only. Access: portal admins (role ADMIN) bypass; otherwise the requester
 * must be the group owner or a GROUP_ADMIN of the group.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId, userId } = await context.params;

  const group = await prisma.groupRoom.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, ownerId: true, tournamentId: true, tournament: { select: { id: true, name: true, type: true } } },
  });
  if (!group) return badRequest("Group not found");

  // ── Authorization: portal admin bypasses; else owner or GROUP_ADMIN ─────────
  const isPortalAdmin = user.role === "ADMIN";
  if (!isPortalAdmin) {
    const isGroupOwner = group.ownerId === user.id;
    if (!isGroupOwner) {
      const membership = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: user.id, groupId } },
      });
      if (!membership || membership.role !== "GROUP_ADMIN") {
        return forbidden("Only group admins can audit predictions");
      }
    }
  }

  if (group.tournament?.type !== "STAGED") {
    return badRequest("Audit is only available for staged tournaments");
  }

  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true },
  });
  if (!member) return badRequest("Member not found");

  const [stages, teams] = await Promise.all([
    prisma.tournamentStage.findMany({
      where: { tournamentId: group.tournament.id },
      orderBy: { order: "asc" },
    }),
    prisma.team.findMany({ select: { id: true, name: true, fifaCode: true } }),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t] as const));
  const teamRef = (id: string | null | undefined): TeamRef | null => {
    if (!id) return null;
    const t = teamMap.get(id);
    return t ? { teamId: t.id, name: t.name, fifaCode: t.fifaCode } : { teamId: id, name: id, fifaCode: "" };
  };

  const auditStages = [];

  for (const stage of stages) {
    const [prediction, score] = await Promise.all([
      prisma.stagePrediction.findUnique({
        where: { userId_stageId_groupId: { userId, stageId: stage.id, groupId } },
      }),
      prisma.stageScore.findUnique({
        where: { userId_stageId_groupId: { userId, stageId: stage.id, groupId } },
      }),
    ]);

    // Skip stages this member never engaged with — keeps the modal focused.
    if (!prediction && !score) continue;

    const stored = score ? { points: score.points, correctPicks: score.correctPicks } : null;
    const submitted = !!prediction?.submittedAt;

    if (stage.type === "GROUP_QUALIFICATION") {
      const qualResult = await prisma.stageQualificationResult.findUnique({ where: { stageId: stage.id } });
      const qualifierIds = (qualResult?.qualifiers as string[] | undefined) ?? [];
      const qualifierSet = new Set(qualifierIds);
      const picks = (prediction?.qualificationPicks as string[] | undefined) ?? [];
      const pickSet = new Set(picks);

      const pickRows = picks.map((id) => ({ team: teamRef(id), correct: qualifierSet.has(id) }));
      const qualifierRows = qualifierIds.map((id) => ({ team: teamRef(id), predicted: pickSet.has(id) }));

      const hasResult = !!qualResult;
      const computedCorrect = pickRows.filter((r) => r.correct).length;
      const computedPoints = computedCorrect * QUALIFICATION_POINTS_PER_CORRECT;

      auditStages.push({
        stageId: stage.id,
        name: stage.name,
        type: stage.type,
        roundLabel: stage.roundLabel,
        status: stage.status,
        submitted,
        hasResult,
        pointsPerUnit: QUALIFICATION_POINTS_PER_CORRECT,
        computed: { correctPicks: computedCorrect, points: computedPoints },
        stored,
        consistent: stored && hasResult ? stored.points === computedPoints : null,
        qualification: { picks: pickRows, qualifiers: qualifierRows, totalPicks: picks.length },
      });
    } else if (stage.type === "KNOCKOUT") {
      const stageMatches = await prisma.stageMatch.findMany({
        where: { stageId: stage.id },
        orderBy: { matchNumber: "asc" },
      });
      const rawPicks = (prediction?.matchPicks as Array<{ matchId: string; winnerId: string }> | undefined) ?? [];
      const pickMap = new Map(rawPicks.map((p) => [p.matchId, p.winnerId] as const));
      const lockedOut = new Set(
        Array.isArray(prediction?.lockedOutMatchIds) ? (prediction!.lockedOutMatchIds as string[]) : []
      );
      const roundPoints = stage.roundLabel ? (ROUND_POINTS[stage.roundLabel] ?? 0) : 0;

      const matchRows = stageMatches.map((m) => {
        const predictedWinnerId = pickMap.get(m.id) ?? null;
        const actualWinnerId = m.winnerId ?? null;
        const isLockedOut = lockedOut.has(m.id);
        const decided = actualWinnerId != null;
        const correct = !isLockedOut && decided && predictedWinnerId != null && predictedWinnerId === actualWinnerId;
        return {
          matchId: m.id,
          matchNumber: m.matchNumber,
          home: teamRef(m.homeTeamId),
          away: teamRef(m.awayTeamId),
          predictedWinner: teamRef(predictedWinnerId),
          actualWinner: teamRef(actualWinnerId),
          lockedOut: isLockedOut,
          decided,
          correct,
        };
      });

      const hasResult = matchRows.some((m) => m.decided);
      const computedCorrect = matchRows.filter((m) => m.correct).length;
      const computedPoints = computedCorrect * roundPoints;

      auditStages.push({
        stageId: stage.id,
        name: stage.name,
        type: stage.type,
        roundLabel: stage.roundLabel,
        status: stage.status,
        submitted,
        hasResult,
        pointsPerUnit: roundPoints,
        computed: { correctPicks: computedCorrect, points: computedPoints },
        stored,
        consistent: stored && hasResult ? stored.points === computedPoints : null,
        knockout: { matches: matchRows },
      });
    }
  }

  return Response.json({
    member: { id: member.id, name: member.name, email: member.email, image: member.image },
    group: { id: group.id, name: group.name },
    tournament: { id: group.tournament.id, name: group.tournament.name },
    stages: auditStages,
  });
}
