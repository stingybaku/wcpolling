import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { id: tournamentId } = await context.params;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      stages: {
        select: { id: true },
      },
    },
  });

  if (!tournament) {
    return new Response(JSON.stringify({ error: "Tournament not found" }), { status: 404 });
  }

  const stageIds = tournament.stages.map((s) => s.id);

  await prisma.$transaction([
    prisma.stagePrediction.deleteMany({ where: { stageId: { in: stageIds } } }),
    prisma.stageScore.deleteMany({ where: { stageId: { in: stageIds } } }),
    prisma.emailLog.deleteMany({ where: { refId: { in: stageIds } } }),
    prisma.tournamentStage.updateMany({
      where: { id: { in: stageIds } },
      data: { status: "UPCOMING" },
    }),
  ]);

  return new Response(JSON.stringify({ success: true, tournamentId, resetStages: stageIds.length }), { status: 200 });
}
