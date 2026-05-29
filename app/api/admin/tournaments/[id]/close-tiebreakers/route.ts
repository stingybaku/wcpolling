import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden } from "@/app/api/helpers";

type RouteContext = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { id } = await context.params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { tieBreakerClosedAt: true },
  });

  if (!tournament) {
    return new Response(JSON.stringify({ error: "Tournament not found" }), { status: 404 });
  }

  if (tournament.tieBreakerClosedAt != null) {
    return new Response(JSON.stringify({ error: "Already closed" }), { status: 409 });
  }

  const closedAt = new Date();
  await prisma.tournament.update({
    where: { id },
    data: { tieBreakerClosedAt: closedAt },
  });

  return new Response(JSON.stringify({ closedAt: closedAt.toISOString() }), { status: 200 });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { id } = await context.params;

  await prisma.tournament.update({
    where: { id },
    data: { tieBreakerClosedAt: null },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
