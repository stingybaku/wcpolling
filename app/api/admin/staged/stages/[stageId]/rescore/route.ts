import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { scoreStage, promoteDraftsToSubmissions } from "@/lib/stage-scoring";
import { evaluateStageBadges } from "@/lib/badges";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

/**
 * Re-score an already-CLOSED or -SCORED stage in place.
 *
 * Unlike the /score route this is a non-destructive CORRECTION: it recomputes
 * StageScores from the current picks + results and re-evaluates badges, but does
 * NOT change the stage status, generate next-round matches, or re-send the
 * "stage scored" emails. Use it to fix stale/drifted scores — e.g. after results
 * were edited, or a member who was inactive during the original scoring (and so
 * was skipped) has been reactivated.
 */
export async function POST(_request: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  if (stage.status !== "CLOSED" && stage.status !== "SCORED") {
    return new Response(
      JSON.stringify({ error: "Only a CLOSED or SCORED stage can be re-scored" }),
      { status: 409 }
    );
  }

  if (stage.type === "GROUP_QUALIFICATION") {
    const qualificationResult = await prisma.stageQualificationResult.findUnique({ where: { stageId } });
    if (!qualificationResult) {
      return new Response(
        JSON.stringify({ error: "No qualification results found for this stage." }),
        { status: 409 }
      );
    }
  } else if (stage.type === "KNOCKOUT") {
    const anyResult = await prisma.stageMatch.findFirst({ where: { stageId, winnerId: { not: null } } });
    if (!anyResult) {
      return new Response(
        JSON.stringify({ error: "No match results found for this stage." }),
        { status: 409 }
      );
    }
  } else {
    return new Response(JSON.stringify({ error: "Unsupported stage type for scoring" }), { status: 400 });
  }

  await promoteDraftsToSubmissions(stageId);
  await scoreStage(stageId);

  try {
    await evaluateStageBadges(stageId);
  } catch (err) {
    console.error("Stage badge evaluation failed during re-score for", stageId, err);
  }

  return new Response(JSON.stringify({ rescored: true, stageId }), { status: 200 });
}
