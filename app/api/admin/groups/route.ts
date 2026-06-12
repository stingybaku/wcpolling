import { NextRequest } from "next/server";
import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const groups = await prisma.groupRoom.findMany({
    include: {
      owner: { select: { id: true, name: true, email: true } },
      tournament: { select: { id: true, name: true, slug: true } },
      _count: {
        select: {
          memberships: true,
          submissions: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return new Response(JSON.stringify({ groups }), { status: 200 });
}

// Approve or reject a pending group room.
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const body = await request.json();
  const groupId = String(body.groupId ?? "").trim();
  const status = String(body.status ?? "").trim();
  if (!groupId) return badRequest("groupId is required");
  if (status !== "APPROVED" && status !== "REJECTED") {
    return badRequest("status must be APPROVED or REJECTED");
  }

  const existing = await prisma.groupRoom.findUnique({ where: { id: groupId } });
  if (!existing) return badRequest("Group not found");

  const group = await prisma.groupRoom.update({
    where: { id: groupId },
    data: { status },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      tournament: { select: { id: true, name: true, slug: true } },
      _count: { select: { memberships: true, submissions: true } },
    },
  });

  return new Response(JSON.stringify({ group }), { status: 200 });
}
