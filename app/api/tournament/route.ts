import { prisma } from "@/lib/prisma";
import { badRequest, getCurrentTournament, getCurrentUser, unauthorized } from "@/app/api/helpers";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get("tournamentId");
  const tournament = await getCurrentTournament(tournamentId);
  if (!tournament) return badRequest("No tournament configured");

  const matches = await prisma.match.findMany({
    where: { tournamentId: tournament.id },
    include: {
      phase: true,
      group: true,
      homeTeam: true,
      awayTeam: true,
      homeSourceGroup: { select: { name: true } },
      awaySourceGroup: { select: { name: true } },
    },
    orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }, { scheduledAt: "asc" }],
  });

  return new Response(JSON.stringify({ tournament, matches }), { status: 200 });
}
