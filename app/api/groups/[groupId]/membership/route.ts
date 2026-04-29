import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, badRequest, forbidden } from "@/app/api/helpers";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId } = await context.params;
  if (!groupId) return badRequest("Missing group id");

  const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { ownerId: true } });
  if (!group) return badRequest("Group not found");

  if (group.ownerId === user.id) {
    return badRequest("The group owner cannot leave. Delete the group instead.");
  }

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!membership) return forbidden("Not a member of this group");

  await prisma.groupMembership.delete({ where: { id: membership.id } });

  return new Response(null, { status: 204 });
}
