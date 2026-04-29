import { badRequest, getCurrentTournament, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { listTournamentNews } from "@/lib/news/sync";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get("tournamentId");
  const tournament = await getCurrentTournament(tournamentId);
  if (!tournament) return badRequest("No tournament configured");

  const limit = Number(searchParams.get("limit") ?? "12");
  const articles = await listTournamentNews(tournament.id, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 24) : 12);

  return new Response(JSON.stringify({ tournament, articles }), { status: 200 });
}
