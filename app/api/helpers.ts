import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const TOURNAMENT_COOKIE = "selectedTournamentId";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  return user;
}

export async function listTournaments(options?: { includeArchived?: boolean }) {
  return prisma.tournament.findMany({
    where: options?.includeArchived ? undefined : { archivedAt: null },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      archivedAt: true,
      tags: {
        orderBy: { name: "asc" },
      },
    },
  });
}

export async function getSelectedTournamentId() {
  const store = await cookies();
  return store.get(TOURNAMENT_COOKIE)?.value ?? null;
}

export async function getTournamentById(tournamentId: string) {
  return prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      groups: {
        include: {
          teams: {
            include: {
              team: true,
            },
            orderBy: { seed: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      phases: {
        orderBy: { sortOrder: "asc" },
      },
      tieBreakers: {
        orderBy: { sortOrder: "asc" },
      },
      tags: {
        orderBy: { name: "asc" },
      },
    },
  });
}

export async function getCurrentTournament(tournamentId?: string | null, options?: { allowArchived?: boolean }) {
  const resolvedTournamentId = tournamentId ?? await getSelectedTournamentId();
  if (resolvedTournamentId) {
    const selectedTournament = await getTournamentById(resolvedTournamentId);
    if (selectedTournament && (options?.allowArchived || !selectedTournament.archivedAt)) return selectedTournament;
  }

  const fallbackTournament = await prisma.tournament.findFirst({
    where: { isActive: true, archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (fallbackTournament) {
    return getTournamentById(fallbackTournament.id);
  }

  const firstTournament = await prisma.tournament.findFirst({
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (!firstTournament) return null;

  return getTournamentById(firstTournament.id);
}

export function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), { status: 400 });
}

export function unauthorized(message = "Unauthorized") {
  return new Response(JSON.stringify({ error: message }), { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return new Response(JSON.stringify({ error: message }), { status: 403 });
}
