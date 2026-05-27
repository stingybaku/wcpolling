import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

const VALID_STAGE_TYPES = ["GROUP_QUALIFICATION", "KNOCKOUT"] as const;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { id: tournamentId } = await context.params;

  const body = await request.json().catch(() => ({}));
  const { name, type, order, opensAt, closesAt, roundLabel } = body;

  if (!name || !String(name).trim()) return badRequest("name is required");
  if (!type || !VALID_STAGE_TYPES.includes(type)) {
    return badRequest("type must be GROUP_QUALIFICATION or KNOCKOUT");
  }
  const orderNum = Number(order);
  if (!order || isNaN(orderNum) || orderNum < 1 || orderNum > 6) {
    return badRequest("order must be between 1 and 6");
  }
  if (!opensAt) return badRequest("opensAt is required");
  if (!closesAt) return badRequest("closesAt is required");

  const opensAtDate = new Date(opensAt);
  const closesAtDate = new Date(closesAt);

  if (isNaN(opensAtDate.getTime())) return badRequest("opensAt is not a valid date");
  if (isNaN(closesAtDate.getTime())) return badRequest("closesAt is not a valid date");
  if (closesAtDate <= opensAtDate) return badRequest("closesAt must be after opensAt");

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    return new Response(JSON.stringify({ error: "Tournament not found" }), { status: 404 });
  }

  const stage = await prisma.tournamentStage.create({
    data: {
      tournamentId,
      name: String(name).trim(),
      type,
      order: orderNum,
      opensAt: opensAtDate,
      closesAt: closesAtDate,
      roundLabel: roundLabel ? String(roundLabel).trim() : null,
    },
  });

  return new Response(JSON.stringify({ stage }), { status: 201 });
}
