import { prisma } from "@/lib/prisma";
import { badRequest, getCurrentTournament, getCurrentUser, unauthorized } from "@/app/api/helpers";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { searchParams } = new URL(request.url);
  const tournament = await getCurrentTournament(searchParams.get("tournamentId"));
  if (!tournament) return badRequest("No tournament configured");

  const matches = await prisma.match.findMany({
    where: { tournamentId: tournament.id },
    include: { homeTeam: true, awayTeam: true, phase: true, group: true },
    orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }, { scheduledAt: "asc" }],
  });

  return new Response(JSON.stringify({ matches, tournament }), { status: 200 });
}
