import { cookies } from "next/headers";
import { badRequest, getCurrentUser, TOURNAMENT_COOKIE, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const tournamentId = String(body.tournamentId ?? "").trim();
  if (!tournamentId) return badRequest("tournamentId is required");

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true },
  });
  if (!tournament) return badRequest("Tournament not found");

  const store = await cookies();
  store.set(TOURNAMENT_COOKIE, tournament.id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return new Response(JSON.stringify({ tournamentId: tournament.id }), { status: 200 });
}
