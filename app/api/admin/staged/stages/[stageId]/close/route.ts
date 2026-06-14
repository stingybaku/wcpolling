import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { promoteDraftsToSubmissions } from "@/lib/stage-scoring";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(_request: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  if (stage.status !== "OPEN") {
    return new Response(
      JSON.stringify({ error: "Stage must be OPEN to close it" }),
      { status: 409 }
    );
  }

  const updated = await prisma.tournamentStage.update({
    where: { id: stageId },
    data: { status: "CLOSED" },
  });

  // Closing locks predictions: turn any saved-but-unsubmitted drafts into
  // submissions so they get scored. Members with no draft remain unscored.
  const promoted = await promoteDraftsToSubmissions(stageId);

  return new Response(JSON.stringify({ stage: updated, promotedDrafts: promoted }), { status: 200 });
}
