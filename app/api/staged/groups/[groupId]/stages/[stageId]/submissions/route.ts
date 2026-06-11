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

  const rows = await prisma.stagePrediction.findMany({
    where: { stageId, groupId },
    select: { userId: true, submittedAt: true, unlockedAt: true, unlockCount: true },
  });

  const submissions = rows.map((r) => ({
    ...r,
    unlocksRemaining: unlocksRemaining(r.unlockCount),
  }));

  return new Response(JSON.stringify({ submissions }), { status: 200 });
}
