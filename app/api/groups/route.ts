import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTournament, getCurrentUser, unauthorized, badRequest } from "@/app/api/helpers";

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
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  const group = await prisma.groupRoom.create({
    data: {
      tournamentId: tournament.id,
      name,
      description,
      ownerId: user.id,
      inviteCode,
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
