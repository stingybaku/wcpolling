import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { scoreStage } from "@/lib/stage-scoring";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(request: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  if (stage.status === "UPCOMING" || stage.status === "SCORED") {
    return new Response(
      JSON.stringify({ error: "Cannot enter results for a stage that is UPCOMING or already SCORED" }),
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));

  if (stage.type === "GROUP_QUALIFICATION") {
    const { qualifiers } = body;

    if (!Array.isArray(qualifiers)) return badRequest("qualifiers must be an array of teamIds");
    if (qualifiers.length !== 32) return badRequest("qualifiers must contain exactly 32 teamIds");

    for (const teamId of qualifiers) {
      if (typeof teamId !== "string") return badRequest("Each qualifier must be a teamId string");
    }

    await prisma.stageQualificationResult.upsert({
      where: { stageId },
      create: { stageId, qualifiers },
      update: { qualifiers },
    });

    await scoreStage(stageId);

    return new Response(JSON.stringify({ success: true, count: qualifiers.length }), { status: 200 });
  }

  if (stage.type === "KNOCKOUT") {
    const { results } = body;

    if (!Array.isArray(results)) return badRequest("results must be an array");

    for (const r of results) {
      if (!r.matchId || typeof r.matchId !== "string") return badRequest("Each result must have a matchId");
      if (!r.winnerId || typeof r.winnerId !== "string") return badRequest("Each result must have a winnerId");
    }

    const matchIds = results.map((r: { matchId: string }) => r.matchId);

    const stageMatches = await prisma.stageMatch.findMany({
      where: { stageId, id: { in: matchIds } },
      select: { id: true },
    });

    const validMatchIds = new Set(stageMatches.map((m) => m.id));
    for (const matchId of matchIds) {
      if (!validMatchIds.has(matchId)) {
        return badRequest(`Match ${matchId} does not belong to this stage`);
      }
    }

    await Promise.all(
      results.map((r: { matchId: string; winnerId: string }) =>
        prisma.stageMatch.update({
          where: { id: r.matchId },
          data: { winnerId: r.winnerId },
        })
      )
    );

    await scoreStage(stageId);

    return new Response(JSON.stringify({ success: true, count: results.length }), { status: 200 });
  }

  return badRequest("Unsupported stage type");
}
