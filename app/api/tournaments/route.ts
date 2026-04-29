import { getCurrentUser, listTournaments, unauthorized } from "@/app/api/helpers";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const tournaments = await listTournaments();
  return new Response(JSON.stringify({ tournaments }), { status: 200 });
}
