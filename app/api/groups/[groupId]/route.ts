import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";

export async function GET(request: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { groupId } = await context.params;
  if (!groupId) return badRequest("Missing groupId");

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });

  const group = await prisma.groupRoom.findUnique({
    where: { id: groupId },
    include: {
      tournament: true,
      owner: true,
      memberships: { include: { user: true } },
      submissions: {
        include: {
          user: true,
          prediction: {
            include: {
              entries: true,
              groupStandings: true,
              tieBreakerAnswers: true,
            },
          },
          scores: {
            orderBy: [{ scoreType: "asc" }, { label: "asc" }],
          },
        },
      },
    },
  });
  if (!group) return badRequest("Group not found");

  // Members see their own group; portal admins may also open any APPROVED group
  // (granting them group-admin access there without being a member).
  if (!membership && !(user.role === "ADMIN" && group.status === "APPROVED")) {
    return forbidden("Not a member of this group");
  }

  const activeMemberIds = new Set(group.memberships.filter((m) => m.isActive).map((m) => m.userId));
  const filteredGroup = {
    ...group,
    submissions: group.submissions.filter((s) => activeMemberIds.has(s.user.id)),
  };
  return new Response(JSON.stringify({ group: filteredGroup }), { status: 200 });
}

// Update group settings (currently the name). Allowed for the portal admin, the
// group owner, or a group admin.
export async function PATCH(request: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { groupId } = await context.params;
  if (!groupId) return badRequest("Missing groupId");

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return badRequest("Group name is required");
  if (name.length > 80) return badRequest("Group name must be 80 characters or fewer");

  const group = await prisma.groupRoom.findUnique({
    where: { id: groupId },
    select: { ownerId: true },
  });
  if (!group) return badRequest("Group not found");

  let allowed = user.role === "ADMIN" || group.ownerId === user.id;
  if (!allowed) {
    const membership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId } },
    });
    allowed = membership?.role === "GROUP_ADMIN";
  }
  if (!allowed) return forbidden("Only group admins or the portal admin can edit this group");

  const updated = await prisma.groupRoom.update({
    where: { id: groupId },
    data: { name },
  });
  return new Response(JSON.stringify({ group: updated }), { status: 200 });
}
