import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";

type RouteContext = { params: Promise<{ groupId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId } = await context.params;

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!membership) return forbidden("Not a member of this group");
  if (!membership.isActive) return forbidden("Your access to this group is paused");

  const group = await prisma.groupRoom.findUnique({
    where: { id: groupId },
    select: { tournamentId: true },
  });
  if (!group?.tournamentId) {
    return new Response(JSON.stringify({ questions: [], answers: [], closedAt: null }), { status: 200 });
  }

  const tournamentId = group.tournamentId;

  const [questions, answers, tournament] = await Promise.all([
    prisma.tieBreakerQuestion.findMany({
      where: { tournamentId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, prompt: true, type: true, sortOrder: true },
    }),
    prisma.stageTieBreakerAnswer.findMany({
      where: { userId: user.id, groupId, tournamentId },
    }),
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { tieBreakerClosedAt: true },
    }),
  ]);

  return new Response(
    JSON.stringify({
      questions,
      answers,
      closedAt: tournament?.tieBreakerClosedAt?.toISOString() ?? null,
    }),
    { status: 200 }
  );
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId } = await context.params;

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!membership) return forbidden("Not a member of this group");
  if (!membership.isActive) return forbidden("Your access to this group is paused");

  const group = await prisma.groupRoom.findUnique({
    where: { id: groupId },
    select: { tournamentId: true },
  });
  if (!group?.tournamentId) return badRequest("Group has no associated tournament");

  const tournamentId = group.tournamentId;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { tieBreakerClosedAt: true },
  });

  if (tournament?.tieBreakerClosedAt != null) {
    return new Response(JSON.stringify({ error: "Tie-breaker submissions are closed" }), { status: 409 });
  }

  const body = await request.json();
  const { answers } = body as { answers: { questionId: string; answer: string }[] };

  if (!Array.isArray(answers)) return badRequest("answers must be an array");

  await Promise.all(
    answers.map((a) =>
      prisma.stageTieBreakerAnswer.upsert({
        where: {
          userId_groupId_tournamentId_questionId: {
            userId: user.id,
            groupId,
            tournamentId,
            questionId: a.questionId,
          },
        },
        create: {
          userId: user.id,
          groupId,
          tournamentId,
          questionId: a.questionId,
          answer: a.answer,
        },
        update: { answer: a.answer },
      })
    )
  );

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
