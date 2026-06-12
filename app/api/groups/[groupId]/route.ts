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
