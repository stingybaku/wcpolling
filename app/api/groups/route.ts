import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTournament, getCurrentUser, unauthorized, badRequest } from "@/app/api/helpers";
import { MAX_GROUPS_PER_USER } from "@/lib/group-limits";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const groups = await prisma.groupRoom.findMany({
    where: {
      memberships: {
        some: {
          userId: user.id,
        },
      },
    },
    include: {
      memberships: {
        include: { user: true },
      },
      owner: true,
      tournament: true,
    },
  });
  return new Response(JSON.stringify({ groups }), { status: 200 });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = await request.json();
  const tournament = await getCurrentTournament(String(body.tournamentId ?? "").trim() || null);
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  if (!name) return badRequest("Group name is required");
  if (!tournament) return badRequest("Select a tournament before creating a group");

  const isPortalAdmin = user.role === "ADMIN";

  // Non-admins may only own one live group. A REJECTED group frees the slot so
  // they can try again; PENDING and APPROVED both count against the limit.
  if (!isPortalAdmin) {
    const ownedCount = await prisma.groupRoom.count({
      where: { ownerId: user.id, status: { not: "REJECTED" } },
    });
    if (ownedCount >= MAX_GROUPS_PER_USER) {
      return badRequest("You can only create one group. Ask the portal admin if you need another.");
    }
  }

  // Admin-created groups are live immediately; everyone else's await approval.
  const status = isPortalAdmin ? "APPROVED" : "PENDING";
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  const group = await prisma.groupRoom.create({
    data: {
      tournamentId: tournament.id,
      name,
      description,
      ownerId: user.id,
      inviteCode,
      status,
      memberships: {
        create: {
          userId: user.id,
          isActive: true,
        },
      },
    },
    include: { memberships: { include: { user: true } }, owner: true, tournament: true },
  });
  return new Response(JSON.stringify({ group }), { status: 201 });
}
