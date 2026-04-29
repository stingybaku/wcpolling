import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTournament, getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const tournament = await getCurrentTournament(request.nextUrl.searchParams.get("tournamentId"), { allowArchived: true });
  const teams = await prisma.team.findMany({
    include: {
      groupMemberships: {
        include: {
          group: true,
        },
        orderBy: [{ seed: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });
  return new Response(JSON.stringify({ teams, tournament }), { status: 200 });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const body = await request.json();
  const tournament = await getCurrentTournament(String(body.tournamentId ?? "").trim() || null, { allowArchived: true });
  const { name, fifaCode, groupId } = body;
  const seed = body.seed == null || body.seed === "" ? null : Number(body.seed);
  if (!name || !fifaCode) return badRequest("name and fifaCode are required");

  const team = await prisma.team.create({
    data: {
      name,
      fifaCode,
      groupMemberships: groupId && tournament
        ? {
            create: {
              groupId: String(groupId),
              seed,
            },
          }
        : undefined,
    },
    include: {
      groupMemberships: {
        include: {
          group: true,
        },
      },
    },
  });
  return new Response(JSON.stringify({ team }), { status: 201 });
}
