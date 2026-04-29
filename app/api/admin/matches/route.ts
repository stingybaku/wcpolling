import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTournament, getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const tournament = await getCurrentTournament(request.nextUrl.searchParams.get("tournamentId"), { allowArchived: true });
  if (!tournament) return badRequest("No tournament configured");

  const matches = await prisma.match.findMany({
    where: { tournamentId: tournament.id },
    include: {
      homeTeam: true,
      awayTeam: true,
      phase: true,
      group: true,
      homeSourceGroup: true,
      awaySourceGroup: true,
      homeSourceMatch: { include: { phase: true } },
      awaySourceMatch: { include: { phase: true } },
    },
    orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }, { scheduledAt: "asc" }],
  });
  return new Response(JSON.stringify({ matches, tournament }), { status: 200 });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const body = await request.json();
  const tournament = await getCurrentTournament(String(body.tournamentId ?? "").trim() || null, { allowArchived: true });
  if (!tournament) return badRequest("No tournament configured");
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
  if (!homeSourceType && !homeTeamId && !homePlaceholder) return badRequest("Home participant source is required");
  if (!awaySourceType && !awayTeamId && !awayPlaceholder) return badRequest("Away participant source is required");

  const match = await prisma.match.create({
    data: {
      tournamentId: tournament.id,
      phaseId,
      groupId: groupId || null,
      label: label ? String(label) : null,
      homeTeamId: homeTeamId || null,
      awayTeamId: awayTeamId || null,
      homePlaceholder: homePlaceholder ? String(homePlaceholder) : null,
      awayPlaceholder: awayPlaceholder ? String(awayPlaceholder) : null,
      homeSourceType: homeSourceType || (homeTeamId ? "TEAM" : homePlaceholder ? "PLACEHOLDER" : "TEAM"),
      awaySourceType: awaySourceType || (awayTeamId ? "TEAM" : awayPlaceholder ? "PLACEHOLDER" : "TEAM"),
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
      status: "SCHEDULED",
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
  return new Response(JSON.stringify({ match }), { status: 201 });
}
