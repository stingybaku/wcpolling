import { getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

const TEAM_SELECT = { select: { id: true, name: true, fifaCode: true } } as const;

// Public (auth-required) read of a tournament's match results for the match center.
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await context.params;

  const matches = await prisma.matchResult.findMany({
    where: { tournamentId: id },
    select: {
      id: true,
      round: true,
      groupName: true,
      matchNumber: true,
      status: true,
      homeScore: true,
      awayScore: true,
      homeYellow: true,
      awayYellow: true,
      homeRed: true,
      awayRed: true,
      penaltyShootout: true,
      homePenalties: true,
      awayPenalties: true,
      kickoffAt: true,
      homeTeam: TEAM_SELECT,
      awayTeam: TEAM_SELECT,
    },
    orderBy: [{ round: "asc" }, { groupName: "asc" }, { matchNumber: "asc" }],
  });
  return Response.json({ matches });
}
