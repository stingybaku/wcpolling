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

// POST: save official group standings for all groups, then resolve bracket + recalculate
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const body = await request.json();
  const tournamentId = String(body.tournamentId ?? "").trim();
  if (!tournamentId) return badRequest("tournamentId required");

  type StandingInput = { groupId: string; teamId: string; position: number };
  const standings: StandingInput[] = Array.isArray(body.standings) ? body.standings : [];
  if (!standings.length) return badRequest("standings array required");

  await prisma.$transaction(async (tx) => {
    const groupIds = [...new Set(standings.map((s) => s.groupId))];
    await tx.officialGroupStanding.deleteMany({
      where: { tournamentId, groupId: { in: groupIds } },
    });
    await tx.officialGroupStanding.createMany({
      data: standings.map((s) => ({
        tournamentId,
        groupId: s.groupId,
        teamId: s.teamId,
        position: s.position,
      })),
    });
  });

  await resolveTournamentBracketParticipants(tournamentId);
  await recalculateTournamentScores(tournamentId);

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
