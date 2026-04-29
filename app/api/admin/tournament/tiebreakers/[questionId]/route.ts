import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { recalculateTournamentScores } from "@/lib/scoring";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ questionId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { questionId } = await context.params;
  if (!questionId) return badRequest("Missing question id");

  const body = await request.json();
  const correctAnswer = String(body.correctAnswer ?? "").trim();

  const question = await prisma.tieBreakerQuestion.update({
    where: { id: questionId },
    data: {
      correctAnswer: correctAnswer || null,
    },
  });

  await recalculateTournamentScores(question.tournamentId);

  return new Response(JSON.stringify({ question }), { status: 200 });
}
