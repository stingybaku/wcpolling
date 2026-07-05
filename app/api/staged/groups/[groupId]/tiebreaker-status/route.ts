import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden } from "@/app/api/helpers";

type RouteContext = { params: Promise<{ groupId: string }> };

// Per-member tie-breaker progress for a group's tournament, for the member
// manager. Returns the question total and each member's count of non-empty
// answers, so the UI can show done / partial (x) / none. Admin-gated like the
// submission-status route.
export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId } = await context.params;

  const isPortalAdmin = user.role === "ADMIN";
  if (!isPortalAdmin) {
    const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { ownerId: true } });
    const isGroupOwner = group?.ownerId === user.id;
    if (!isGroupOwner) {
      const membership = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: user.id, groupId } },
      });
      if (!membership || membership.role !== "GROUP_ADMIN") {
        return forbidden("Only group admins can view tie-breaker statuses");
      }
    }
  }

  const group = await prisma.groupRoom.findUnique({
    where: { id: groupId },
    select: { tournamentId: true },
  });
  if (!group?.tournamentId) {
    return new Response(JSON.stringify({ total: 0, answered: {}, closed: false }), { status: 200 });
  }
  const tournamentId = group.tournamentId;

  const [questions, answers, tournament] = await Promise.all([
    prisma.tieBreakerQuestion.findMany({ where: { tournamentId }, select: { id: true } }),
    prisma.stageTieBreakerAnswer.findMany({
      where: { groupId, tournamentId },
      select: { userId: true, questionId: true, answer: true },
    }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { tieBreakerClosedAt: true } }),
  ]);

  const total = questions.length;
  const questionIds = new Set(questions.map((q) => q.id));

  // Count each member's distinct non-empty answers to still-valid questions;
  // a member is "done" only when that count covers every question.
  const answeredByUser = new Map<string, Set<string>>();
  for (const a of answers) {
    if (!questionIds.has(a.questionId)) continue;
    if (!a.answer || a.answer.trim() === "") continue;
    let set = answeredByUser.get(a.userId);
    if (!set) { set = new Set(); answeredByUser.set(a.userId, set); }
    set.add(a.questionId);
  }

  // userId → number of distinct questions answered (non-empty).
  const answered: Record<string, number> = {};
  for (const [uid, set] of answeredByUser.entries()) answered[uid] = set.size;

  return new Response(
    JSON.stringify({ total, answered, closed: tournament?.tieBreakerClosedAt != null }),
    { status: 200 }
  );
}
