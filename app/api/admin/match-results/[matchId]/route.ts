import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { resolveTieBreakers } from "@/lib/match-results";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// Update a single match's team-level stats / status, then re-resolve tie-breakers.
export async function PATCH(req: Request, context: { params: Promise<{ matchId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const { matchId } = await context.params;

  const existing = await prisma.matchResult.findUnique({
    where: { id: matchId },
    select: { id: true, tournamentId: true },
  });
  if (!existing) return badRequest("Match not found");

  const body = await req.json();
  const status = body.status === "FINISHED" ? "FINISHED" : body.status === "SCHEDULED" ? "SCHEDULED" : undefined;

  const updated = await prisma.matchResult.update({
    where: { id: matchId },
    data: {
      homeScore: intOrNull(body.homeScore),
      awayScore: intOrNull(body.awayScore),
      homeYellow: intOrNull(body.homeYellow) ?? 0,
      awayYellow: intOrNull(body.awayYellow) ?? 0,
      homeRed: intOrNull(body.homeRed) ?? 0,
      awayRed: intOrNull(body.awayRed) ?? 0,
      penaltyShootout: Boolean(body.penaltyShootout),
      homePenalties: intOrNull(body.homePenalties),
      awayPenalties: intOrNull(body.awayPenalties),
      ...(status ? { status } : {}),
    },
  });

  // Keep tie-breaker answers in sync with the recorded results.
  const tieBreakers = await resolveTieBreakers(existing.tournamentId);

  return Response.json({ match: updated, tieBreakers });
}
