import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(_request: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  if (stage.status === "SCORED") {
    return new Response(
      JSON.stringify({ error: "Cannot reset a SCORED stage" }),
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.stagePrediction.deleteMany({ where: { stageId } }),
    prisma.stageScore.deleteMany({ where: { stageId } }),
    prisma.emailLog.deleteMany({ where: { refId: stageId } }),
    prisma.tournamentStage.update({
      where: { id: stageId },
      data: { status: "UPCOMING" },
    }),
  ]);

  return new Response(JSON.stringify({ success: true, stageId }), { status: 200 });
}
