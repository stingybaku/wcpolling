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
  if (!membership) return forbidden("Not a member of this group");

  const members = await prisma.groupMembership.findMany({
    where: { groupId },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return new Response(JSON.stringify({ members }), { status: 200 });
}
