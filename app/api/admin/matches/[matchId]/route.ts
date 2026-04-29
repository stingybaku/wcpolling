import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { resolveTournamentBracketParticipants } from "@/lib/bracket-resolution";
import { recalculateTournamentScores } from "@/lib/scoring";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function PUT(request: NextRequest, context: { params: Promise<{ matchId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { matchId } = await context.params;
  if (!matchId) return badRequest("Missing match id");

  const body = await request.json();
  const {
    phaseId,
    groupId,
    label,
    homeTeamId,
    awayTeamId,
    homePlaceholder,
    awayPlaceholder,
    homeSourceType,
    awaySourceType,
    homeSourceGroupId,
    awaySourceGroupId,
    homeSourcePosition,
    awaySourcePosition,
    homeSourceMatchId,
    awaySourceMatchId,
    homeSourceOutcome,
    awaySourceOutcome,
    homeSourceThirdRank,
    awaySourceThirdRank,
    homeSourceThirdGroups,
    awaySourceThirdGroups,
    scheduledAt,
    sortOrder,
  } = body;

  if (!phaseId) return badRequest("phaseId is required");

  const match = await prisma.match.update({
    where: { id: matchId },
    data: {
      phaseId,
      groupId: groupId || null,
      label: label ? String(label) : null,
      homeTeamId: homeTeamId || null,
      awayTeamId: awayTeamId || null,
      homePlaceholder: homePlaceholder ? String(homePlaceholder) : null,
      awayPlaceholder: awayPlaceholder ? String(awayPlaceholder) : null,
      homeSourceType: homeSourceType || "TEAM",
      awaySourceType: awaySourceType || "TEAM",
      homeSourceGroupId: homeSourceGroupId || null,
      awaySourceGroupId: awaySourceGroupId || null,
      homeSourcePosition: homeSourcePosition == null ? null : Number(homeSourcePosition),
      awaySourcePosition: awaySourcePosition == null ? null : Number(awaySourcePosition),
      homeSourceMatchId: homeSourceMatchId || null,
      awaySourceMatchId: awaySourceMatchId || null,
      homeSourceOutcome: homeSourceOutcome || null,
      awaySourceOutcome: awaySourceOutcome || null,
      homeSourceThirdRank: homeSourceThirdRank == null ? null : Number(homeSourceThirdRank),
      awaySourceThirdRank: awaySourceThirdRank == null ? null : Number(awaySourceThirdRank),
      homeSourceThirdGroups: homeSourceThirdGroups ? String(homeSourceThirdGroups) : null,
      awaySourceThirdGroups: awaySourceThirdGroups ? String(awaySourceThirdGroups) : null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      sortOrder: Number(sortOrder ?? 0),
    },
    include: {
      phase: true,
      group: true,
      homeTeam: true,
      awayTeam: true,
      homeSourceGroup: true,
      awaySourceGroup: true,
      homeSourceMatch: { include: { phase: true } },
      awaySourceMatch: { include: { phase: true } },
    },
  });

  await resolveTournamentBracketParticipants(match.tournamentId);
  await recalculateTournamentScores(match.tournamentId);

  return new Response(JSON.stringify({ match }), { status: 200 });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ matchId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { matchId } = await context.params;
  if (!matchId) return badRequest("Missing match id");

  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { tournamentId: true, status: true } });
  if (!match) return badRequest("Match not found");

  if (match.status === "FINISHED") {
    return new Response(JSON.stringify({ error: "Cannot delete a finished match. Reset its result first." }), { status: 409 });
  }

  await prisma.match.delete({ where: { id: matchId } });
  await recalculateTournamentScores(match.tournamentId);

  return new Response(null, { status: 204 });
}
