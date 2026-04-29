import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
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

  const tournaments = await prisma.tournament.findMany({
    orderBy: [{ archivedAt: "asc" }, { isActive: "desc" }, { updatedAt: "desc" }, { name: "asc" }],
    include: {
      tags: {
        orderBy: { name: "asc" },
      },
      _count: {
        select: {
          groups: true,
          phases: true,
          matches: true,
          predictions: true,
          groupRooms: true,
        },
      },
    },
  });

  return new Response(JSON.stringify({ tournaments }), { status: 200 });
}
