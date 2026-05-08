import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTournament, getCurrentUser, unauthorized, forbidden } from "@/app/api/helpers";

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
  if (!tournament) return new Response(JSON.stringify({ tournament: null }), { status: 200 });

  const [matches, officialGroupStandings, officialThirdPlace] = await Promise.all([
    prisma.match.findMany({
      where: { tournamentId: tournament.id },
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
      orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    prisma.officialGroupStanding.findMany({
      where: { tournamentId: tournament.id },
      orderBy: [{ group: { sortOrder: "asc" } }, { position: "asc" }],
    }),
    prisma.officialThirdPlaceRanking.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { rank: "asc" },
    }),
  ]);

  return new Response(JSON.stringify({ tournament, matches, officialGroupStandings, officialThirdPlace }), { status: 200 });
}
