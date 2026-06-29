import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden } from "@/app/api/helpers";
import { unlocksRemaining } from "@/lib/staged-unlocks";

type RouteContext = { params: Promise<{ groupId: string; stageId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId, stageId } = await context.params;

  const isPortalAdmin = user.role === "ADMIN";
  if (!isPortalAdmin) {
    const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { ownerId: true } });
    const isGroupOwner = group?.ownerId === user.id;
    if (!isGroupOwner) {
      const membership = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: user.id, groupId } },
      });
      if (!membership || membership.role !== "GROUP_ADMIN") {
        return forbidden("Only group admins can view submission statuses");
      }
    }
  }

  const [rows, graces] = await Promise.all([
    prisma.stagePrediction.findMany({
      where: { stageId, groupId },
      select: { userId: true, submittedAt: true, unlockedAt: true, unlockCount: true },
    }),
    prisma.stageSubmissionGrace.findMany({
      where: { stageId, groupId },
      select: { userId: true },
    }),
  ]);

  const submissions = rows.map((r) => ({
    ...r,
    unlocksRemaining: unlocksRemaining(r.unlockCount),
  }));

  // Members with an outstanding late-submission allowance (may have no
  // prediction row yet, so returned as a separate list).
  const graceUserIds = graces.map((g) => g.userId);

  return new Response(JSON.stringify({ submissions, graceUserIds }), { status: 200 });
}
