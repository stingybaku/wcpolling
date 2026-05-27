import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function PUT(request: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  if (stage.status === "SCORED") {
    return new Response(JSON.stringify({ error: "Cannot update a SCORED stage" }), { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const { name, opensAt, closesAt, roundLabel } = body;

  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    if (!String(name).trim()) return badRequest("name cannot be empty");
    data.name = String(name).trim();
  }

  if (opensAt !== undefined || closesAt !== undefined) {
    const newOpensAt = opensAt ? new Date(opensAt) : stage.opensAt;
    const newClosesAt = closesAt ? new Date(closesAt) : stage.closesAt;

    if (opensAt && isNaN(newOpensAt.getTime())) return badRequest("opensAt is not a valid date");
    if (closesAt && isNaN(newClosesAt.getTime())) return badRequest("closesAt is not a valid date");
    if (newClosesAt <= newOpensAt) return badRequest("closesAt must be after opensAt");

    if (opensAt !== undefined) data.opensAt = newOpensAt;
    if (closesAt !== undefined) data.closesAt = newClosesAt;
  }

  if (roundLabel !== undefined) {
    data.roundLabel = roundLabel ? String(roundLabel).trim() : null;
  }

  const updated = await prisma.tournamentStage.update({
    where: { id: stageId },
    data,
  });

  return new Response(JSON.stringify({ stage: updated }), { status: 200 });
}
