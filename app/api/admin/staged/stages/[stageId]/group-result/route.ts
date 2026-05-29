import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { scoreStage } from "@/lib/stage-scoring";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function GET(_req: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const { stageId } = await context.params;
  const result = await prisma.stageGroupResult.findUnique({ where: { stageId } });
  return Response.json({ result });
}

export async function PUT(req: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const { stageId } = await context.params;
  const { standings, thirdPlace } = await req.json();

  const result = await prisma.stageGroupResult.upsert({
    where: { stageId },
    create: { stageId, standings, thirdPlace },
    update: { standings, thirdPlace },
  });

  // Compute provisional qualifiers and score on every save
  const standingsMap = standings as Record<string, string[]>;
  const thirds = thirdPlace as string[];

  const qualifiers = [
    ...Object.values(standingsMap).flatMap((arr: string[]) => arr.slice(0, 2)),
    ...thirds.slice(0, 8),
  ];

  if (qualifiers.length === 32) {
    await prisma.stageQualificationResult.upsert({
      where: { stageId },
      create: { stageId, qualifiers },
      update: { qualifiers },
    });
    await scoreStage(stageId);
  }

  return Response.json({ result });
}
