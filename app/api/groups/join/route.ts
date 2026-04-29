import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, badRequest } from "@/app/api/helpers";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { inviteCode } = await request.json();
  if (!inviteCode || typeof inviteCode !== "string") return badRequest("inviteCode is required");

  const group = await prisma.groupRoom.findUnique({ where: { inviteCode } });
  if (!group) return badRequest("Invalid invite code");

  const existing = await prisma.groupMembership.findUnique({
    where: {
      userId_groupId: {
        userId: user.id,
        groupId: group.id,
      },
    },
  });
  if (existing) return badRequest("You are already a member of this group");

  const membership = await prisma.groupMembership.create({
    data: {
      userId: user.id,
      groupId: group.id,
    },
    include: {
      user: true,
    },
  });

  return new Response(JSON.stringify({ group, membership }), { status: 200 });
}
