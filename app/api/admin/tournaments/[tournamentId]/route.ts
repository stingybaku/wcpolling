import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function PATCH(request: Request, context: { params: Promise<{ tournamentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { tournamentId } = await context.params;
  if (!tournamentId) return badRequest("Missing tournament id");

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();

  if (!action) return badRequest("action is required");

  if (action === "archive") {
    const tournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        archivedAt: new Date(),
        isActive: false,
      },
    });
    return new Response(JSON.stringify({ tournament }), { status: 200 });
  }

  if (action === "restore") {
    const tournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        archivedAt: null,
      },
    });
    return new Response(JSON.stringify({ tournament }), { status: 200 });
  }

  if (action === "activate") {
    await prisma.tournament.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    const tournament = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        isActive: true,
        archivedAt: null,
      },
    });
    return new Response(JSON.stringify({ tournament }), { status: 200 });
  }

  return badRequest("Unsupported action");
}
