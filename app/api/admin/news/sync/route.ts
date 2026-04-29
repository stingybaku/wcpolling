import { NextRequest } from "next/server";
import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { syncTournamentNews } from "@/lib/news/sync";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const tournamentId = String(body.tournamentId ?? "").trim() || null;

  try {
    const result = await syncTournamentNews(tournamentId);
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync newsroom.";
    return badRequest(message);
  }
}
