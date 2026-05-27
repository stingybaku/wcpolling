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
          stages: true,
        },
      },
    },
  });

  return new Response(JSON.stringify({ tournaments }), { status: 200 });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return new Response(JSON.stringify({ error: "Name is required." }), { status: 400 });
  }

  const rawType = body.type;
  const type = rawType === "STAGED" ? "STAGED" : "CLASSIC";

  const tournament = await prisma.tournament.create({
    data: {
      name: body.name.trim(),
      slug: typeof body.slug === "string" ? body.slug.trim() : body.name.trim().toLowerCase().replace(/\s+/g, "-"),
      type,
    },
  });

  return new Response(JSON.stringify({ tournament }), { status: 201 });
}
