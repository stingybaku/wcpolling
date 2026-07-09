import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
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

  const stage = await prisma.tournamentStage.findUnique({
    where: { id: stageId },
    include: { qualificationResult: { select: { qualifiers: true } } },
  });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  const [submissions, scores] = await Promise.all([
    prisma.stagePrediction.findMany({
      where: { stageId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.stageScore.findMany({
      where: { stageId },
      select: { userId: true, groupId: true, points: true, correctPicks: true },
    }),
  ]);

  const scoreByUserGroup = new Map(scores.map((s) => [`${s.userId}:${s.groupId}`, s]));
  const withScores = submissions.map((sub) => ({
    ...sub,
    score: scoreByUserGroup.get(`${sub.userId}:${sub.groupId}`) ?? null,
  }));

  return new Response(
    JSON.stringify({
      stage: {
        id: stage.id,
        name: stage.name,
        type: stage.type,
        status: stage.status,
        tournamentId: stage.tournamentId,
        closesAt: stage.closesAt,
        qualifiers: stage.qualificationResult?.qualifiers ?? null,
      },
      submissions: withScores,
    }),
    { status: 200 }
  );
}
