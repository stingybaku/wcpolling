import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { scoreStage } from "@/lib/stage-scoring";
import { sendEmail } from "@/lib/email";
import { stageScoredEmail } from "@/lib/emails/stageScored";
import { toLocale } from "@/lib/locale";

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

  if (stage.status !== "CLOSED") {
    return new Response(
      JSON.stringify({ error: "Stage must be CLOSED to compute scores" }),
      { status: 409 }
    );
  }

  if (stage.type === "GROUP_QUALIFICATION") {
    const qualificationResult = await prisma.stageQualificationResult.findUnique({ where: { stageId } });
    if (!qualificationResult) {
      return new Response(
        JSON.stringify({ error: "No qualification results found for this stage. Enter results first." }),
        { status: 409 }
      );
    }
  } else if (stage.type === "KNOCKOUT") {
    const anyResult = await prisma.stageMatch.findFirst({ where: { stageId, winnerId: { not: null } } });
    if (!anyResult) {
      return new Response(
        JSON.stringify({ error: "No match results found for this stage. Enter results first." }),
        { status: 409 }
      );
    }
  } else {
    return new Response(JSON.stringify({ error: "Unsupported stage type for scoring" }), { status: 400 });
  }

  await scoreStage(stageId);

  await prisma.tournamentStage.update({
    where: { id: stageId },
    data: { status: "SCORED" },
  });

  // Auto-generate next stage's matches from current stage winners
  let nextMatchesGenerated = false;
  if (stage.type === "KNOCKOUT") {
    const nextStage = await prisma.tournamentStage.findFirst({
      where: { tournamentId: stage.tournamentId, type: "KNOCKOUT", order: { gt: stage.order } },
      orderBy: { order: "asc" },
    });
    if (nextStage) {
      const existingMatches = await prisma.stageMatch.count({ where: { stageId: nextStage.id } });
      if (existingMatches === 0) {
        const currentMatches = await prisma.stageMatch.findMany({
          where: { stageId, winnerId: { not: null } },
        });
        // Sort numerically by matchNumber
        currentMatches.sort((a, b) => parseInt(a.matchNumber) - parseInt(b.matchNumber));
        const nextMatches = [];
        for (let i = 0; i < currentMatches.length; i += 2) {
          const home = currentMatches[i];
          const away = currentMatches[i + 1];
          if (!home?.winnerId || !away?.winnerId) break;
          nextMatches.push({
            stageId: nextStage.id,
            matchNumber: String(Math.floor(i / 2) + 1),
            homeTeamId: home.winnerId,
            awayTeamId: away.winnerId,
          });
        }
        if (nextMatches.length > 0) {
          await prisma.stageMatch.createMany({ data: nextMatches });
          nextMatchesGenerated = true;
        }
      }
    }
  }

  // Notify each active member of each group with their personal score and rank
  const tournament = await prisma.tournament.findUnique({
    where: { id: stage.tournamentId },
    select: { name: true },
  });
  const groups = await prisma.groupRoom.findMany({
    where: { tournamentId: stage.tournamentId },
    include: {
      memberships: {
        where: { isActive: true },
        include: { user: { select: { id: true, email: true, locale: true } } },
      },
    },
  });
  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  for (const group of groups) {
    const activeMemberIds = group.memberships.map((m) => m.userId);
    const [stageScores, cumulative, submittedPredictions] = await Promise.all([
      prisma.stageScore.findMany({ where: { stageId, groupId: group.id, userId: { in: activeMemberIds } } }),
      prisma.stageScore.groupBy({
        by: ["userId"],
        where: { groupId: group.id, userId: { in: activeMemberIds } },
        _sum: { points: true },
      }),
      prisma.stagePrediction.findMany({
        where: { stageId, groupId: group.id, submittedAt: { not: null } },
        select: { userId: true },
      }),
    ]);
    const submittedUserIds = new Set(submittedPredictions.map((p) => p.userId));
    const cumulativeMap = Object.fromEntries(cumulative.map((s) => [s.userId, s._sum.points ?? 0]));
    const sorted = [...cumulative].sort((a, b) => (b._sum.points ?? 0) - (a._sum.points ?? 0));
    const rankMap: Record<string, number> = {};
    sorted.forEach((s, i) => { rankMap[s.userId] = i + 1; });

    for (const m of group.memberships) {
      if (!m.user.email) continue;
      if (!submittedUserIds.has(m.userId)) continue;
      const score = stageScores.find((s) => s.userId === m.userId);
      if (!score) continue;
      const { subject, html } = stageScoredEmail(
        stage.name, tournament!.name,
        score.points,
        cumulativeMap[m.userId] ?? 0,
        rankMap[m.userId] ?? group.memberships.length,
        `${baseUrl}/dashboard/groups/${group.id}`,
        toLocale(m.user.locale),
      );
      sendEmail({ to: m.user.email, subject, html }).catch(() => null);
    }
  }

  return new Response(JSON.stringify({ scored: true, stageId, nextMatchesGenerated }), { status: 200 });
}
