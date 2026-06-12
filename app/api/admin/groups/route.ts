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
