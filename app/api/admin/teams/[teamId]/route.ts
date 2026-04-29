import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, getCurrentTournament, getCurrentUser, unauthorized } from "@/app/api/helpers";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function PUT(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { teamId } = await context.params;
  if (!teamId) return badRequest("Missing team id");

  const body = await request.json();
  const tournament = await getCurrentTournament(String(body.tournamentId ?? "").trim() || null, { allowArchived: true });
  const name = String(body.name ?? "").trim();
  const fifaCode = String(body.fifaCode ?? "").trim().toUpperCase();
  const groupId = String(body.groupId ?? "").trim() || null;
  const seed = body.seed == null || body.seed === "" ? null : Number(body.seed);

  if (!name || !fifaCode) return badRequest("name and fifaCode are required");

  const team = await prisma.$transaction(async (tx) => {
    const updatedTeam = await tx.team.update({
      where: { id: teamId },
      data: { name, fifaCode },
    });

    if (tournament) {
      const tournamentGroupIds = (
        await tx.tournamentGroup.findMany({
          where: { tournamentId: tournament.id },
          select: { id: true },
        })
      ).map((group) => group.id);

      if (tournamentGroupIds.length > 0) {
        await tx.tournamentGroupTeam.deleteMany({
          where: {
            teamId,
            groupId: { in: tournamentGroupIds },
          },
        });
      }

      if (groupId) {
        await tx.tournamentGroupTeam.create({
          data: {
            teamId,
            groupId,
            seed,
          },
        });
      }
    }

    return tx.team.findUniqueOrThrow({
      where: { id: updatedTeam.id },
      include: {
        groupMemberships: {
          include: {
            group: true,
          },
          orderBy: [{ seed: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  });

  return new Response(JSON.stringify({ team }), { status: 200 });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { teamId } = await context.params;
  if (!teamId) return badRequest("Missing team id");

  await prisma.team.delete({
    where: { id: teamId },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
