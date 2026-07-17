import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function GET(_request: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  const matches = await prisma.stageMatch.findMany({
    where: { stageId },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: { matchNumber: "asc" },
  });

  return new Response(JSON.stringify({ matches }), { status: 200 });
}

export async function POST(request: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  if (stage.type !== "KNOCKOUT") {
    return new Response(
      JSON.stringify({ error: "Matches can only be entered for KNOCKOUT stages" }),
      { status: 409 }
    );
  }

  if (stage.status !== "UPCOMING" && stage.status !== "OPEN") {
    return new Response(
      JSON.stringify({ error: "Stage must be UPCOMING or OPEN to enter matches" }),
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { matchNumber, homeTeamId, awayTeamId } = body;
  // The admin form historically sends the kickoff as `scheduledAt`
  const matchDate = body.matchDate ?? body.scheduledAt;

  if (!matchNumber || typeof matchNumber !== "string") return badRequest("matchNumber is required");
  if (!homeTeamId) return badRequest("homeTeamId is required");
  if (!awayTeamId) return badRequest("awayTeamId is required");

  if (homeTeamId === awayTeamId) {
    return badRequest("homeTeamId and awayTeamId must be different teams");
  }

  // Validate both teams exist
  const [homeTeam, awayTeam] = await Promise.all([
    prisma.team.findUnique({ where: { id: homeTeamId } }),
    prisma.team.findUnique({ where: { id: awayTeamId } }),
  ]);

  if (!homeTeam) return badRequest("homeTeamId does not refer to a valid team");
  if (!awayTeam) return badRequest("awayTeamId does not refer to a valid team");

  // Ensure no team appears twice in the same stage (excluding the current matchNumber being upserted)
  const existingMatches = await prisma.stageMatch.findMany({
    where: {
      stageId,
      matchNumber: { not: matchNumber },
    },
  });

  const usedTeamIds = new Set<string>();
  for (const m of existingMatches) {
    if (m.homeTeamId) usedTeamIds.add(m.homeTeamId);
    if (m.awayTeamId) usedTeamIds.add(m.awayTeamId);
  }

  if (usedTeamIds.has(homeTeamId)) {
    return badRequest(`Team ${homeTeamId} already appears in another match in this stage`);
  }
  if (usedTeamIds.has(awayTeamId)) {
    return badRequest(`Team ${awayTeamId} already appears in another match in this stage`);
  }

  const match = await prisma.stageMatch.upsert({
    where: {
      stageId_matchNumber: {
        stageId,
        matchNumber,
      },
    },
    create: {
      stageId,
      matchNumber,
      homeTeamId,
      awayTeamId,
      matchDate: matchDate ? new Date(matchDate) : null,
    },
    update: {
      homeTeamId,
      awayTeamId,
      matchDate: matchDate ? new Date(matchDate) : null,
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });

  return new Response(JSON.stringify({ match }), { status: 200 });
}
