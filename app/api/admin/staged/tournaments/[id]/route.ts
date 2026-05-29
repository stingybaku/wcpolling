import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { id } = await context.params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      stages: {
        orderBy: { order: "asc" },
      },
      groupRooms: {
        include: {
          memberships: {
            where: { isActive: true },
            select: { id: true },
          },
        },
      },
      tieBreakers: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!tournament) {
    return new Response(JSON.stringify({ error: "Tournament not found" }), { status: 404 });
  }

  // Count submitted predictions per stage
  const stagesWithCounts = await Promise.all(
    tournament.stages.map(async (stage: { id: string }) => {
      const submittedCount = await prisma.stagePrediction.count({
        where: {
          stageId: stage.id,
          submittedAt: { not: null },
        },
      });
      return {
        ...stage,
        submittedCount,
      };
    })
  );

  // Count total active members across all groups of this tournament
  const activeMemberCount = tournament.groupRooms.reduce(
    (sum: number, group: { memberships: { id: string }[] }) => sum + group.memberships.length,
    0
  );

  return new Response(
    JSON.stringify({
      tournament: {
        ...tournament,
        stages: stagesWithCounts,
        activeMemberCount,
        tieBreakerClosedAt: tournament.tieBreakerClosedAt?.toISOString() ?? null,
      },
    }),
    { status: 200 }
  );
}
