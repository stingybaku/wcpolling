import { prisma } from "@/lib/prisma";
import { promoteDraftsToSubmissions } from "@/lib/stage-scoring";

/**
 * Flip any OPEN stage whose deadline has passed to CLOSED, mirroring the
 * manual close endpoint (drafts with picks are promoted to submissions so
 * they get scored). Called lazily from stage-listing endpoints and the
 * deadline cron — there is no dedicated scheduler for this transition.
 *
 * Returns the number of stages closed.
 */
export async function autoCloseExpiredStages(tournamentId?: string): Promise<number> {
  const expired = await prisma.tournamentStage.findMany({
    where: {
      status: "OPEN",
      closesAt: { lte: new Date() },
      ...(tournamentId ? { tournamentId } : {}),
    },
    select: { id: true },
  });

  let closed = 0;
  for (const stage of expired) {
    // Guard on status so a concurrent request (or manual close) racing this
    // one doesn't promote drafts twice.
    const res = await prisma.tournamentStage.updateMany({
      where: { id: stage.id, status: "OPEN" },
      data: { status: "CLOSED" },
    });
    if (res.count > 0) {
      await promoteDraftsToSubmissions(stage.id);
      closed++;
    }
  }
  return closed;
}
