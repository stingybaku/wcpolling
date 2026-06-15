import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { generateMatchFixtures } from "@/lib/match-results";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

const TEAM_SELECT = { select: { id: true, name: true, fifaCode: true } } as const;

// List all match results for a tournament.
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const { id } = await context.params;

  const matches = await prisma.matchResult.findMany({
    where: { tournamentId: id },
    include: { homeTeam: TEAM_SELECT, awayTeam: TEAM_SELECT },
    orderBy: [{ round: "asc" }, { groupName: "asc" }, { matchNumber: "asc" }],
  });
  return Response.json({ matches });
}

// Generate / sync the fixture list (group round-robin + knockout from the bracket).
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const { id } = await context.params;

  const created = await generateMatchFixtures(id);
  return Response.json({ generated: true, ...created });
}
