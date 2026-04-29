import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";
import { resolveTournamentBracketParticipants } from "@/lib/bracket-resolution";
import { recalculateTournamentScores } from "@/lib/scoring";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(request: NextRequest, context: { params: Promise<{ matchId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const { matchId } = await context.params;
  const { homeScore, awayScore } = await request.json();
  if (homeScore == null || awayScore == null) return badRequest("homeScore and awayScore are required");

  const existingMatch = await prisma.match.findUnique({ where: { id: matchId } });
  if (!existingMatch) return badRequest("Match not found");

  const winnerId = Number(homeScore) > Number(awayScore) ? existingMatch.homeTeamId : Number(homeScore) < Number(awayScore) ? existingMatch.awayTeamId : null;

  const match = await prisma.match.update({
    where: { id: matchId },
    data: {
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
      status: "FINISHED",
      winnerId,
    },
  });

  await resolveTournamentBracketParticipants(match.tournamentId);
  await recalculateTournamentScores(match.tournamentId);

  return new Response(JSON.stringify({ match, message: "Results updated and scores recalculated." }), { status: 200 });
}
