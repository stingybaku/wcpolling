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

// POST: save official third-place rankings, then resolve bracket
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const body = await request.json();
  const tournamentId = String(body.tournamentId ?? "").trim();
  if (!tournamentId) return badRequest("tournamentId required");

  const teamIds: string[] = Array.isArray(body.teamIds) ? body.teamIds.map(String) : [];
  if (!teamIds.length) return badRequest("teamIds array required");

  await prisma.$transaction(async (tx) => {
    await tx.officialThirdPlaceRanking.deleteMany({ where: { tournamentId } });
    await tx.officialThirdPlaceRanking.createMany({
      data: teamIds.map((teamId, i) => ({ tournamentId, teamId, rank: i + 1 })),
    });
  });

  await resolveTournamentBracketParticipants(tournamentId);
  await recalculateTournamentScores(tournamentId);

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
