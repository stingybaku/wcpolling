import { badRequest, forbidden, getCurrentTournament, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { resolveTournamentBracketParticipants } from "@/lib/bracket-resolution";
import { recalculateTournamentScores } from "@/lib/scoring";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const tournament = await getCurrentTournament(String(body.tournamentId ?? "").trim() || null, { allowArchived: true });
  if (!tournament) return badRequest("No tournament configured");

  const updatedCount = await resolveTournamentBracketParticipants(tournament.id);
  await recalculateTournamentScores(tournament.id);

  return new Response(JSON.stringify({ message: `Bracket participants resolved. Updated ${updatedCount} match slots.` }), { status: 200 });
}
