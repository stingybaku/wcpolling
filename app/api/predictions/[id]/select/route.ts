import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, badRequest, forbidden } from "@/app/api/helpers";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id: predictionId } = await context.params;
  if (!predictionId) return badRequest("Missing prediction id");

  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: { tournament: { select: { submissionDeadline: true } } },
  });
  if (!prediction || prediction.userId !== user.id) return forbidden("Prediction not found");

  if (prediction.tournament?.submissionDeadline && new Date() > prediction.tournament.submissionDeadline) {
    return new Response(JSON.stringify({ error: "The submission deadline has passed" }), { status: 403 });
  }

  await prisma.prediction.updateMany({ where: { userId: user.id, tournamentId: prediction.tournamentId }, data: { selected: false } });
  const selected = await prisma.prediction.update({ where: { id: predictionId }, data: { selected: true } });

  return new Response(JSON.stringify({ selected }), { status: 200 });
}
