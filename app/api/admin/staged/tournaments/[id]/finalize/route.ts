import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { tournamentFinalizedEmail } from "@/lib/emails/tournamentFinalized";
import { toLocale } from "@/lib/locale";
import { evaluateTournamentBadges } from "@/lib/badges";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { id } = await context.params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { stages: { select: { status: true } } },
  });

  if (!tournament) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.type !== "STAGED") {
    return Response.json({ error: "Only staged tournaments can be finalized" }, { status: 400 });
  }
  if (tournament.stages.some((s) => s.status !== "SCORED")) {
    return Response.json({ error: "All stages must be scored before finalizing" }, { status: 409 });
  }

  const updated = await prisma.tournament.update({
    where: { id },
    data: { finalizedAt: new Date() },
  });

  // Award tournament badges. Never let a badge failure break finalization.
  try {
    await evaluateTournamentBadges(id);
  } catch (err) {
    console.error("Tournament badge evaluation failed for", id, err);
  }

  // Notify each active member of each group with their final rank
  const groups = await prisma.groupRoom.findMany({
    where: { tournamentId: id },
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
    const cumulative = await prisma.stageScore.groupBy({
      by: ["userId"],
      where: { groupId: group.id, userId: { in: activeMemberIds } },
      _sum: { points: true },
    });
    const sorted = [...cumulative].sort((a, b) => (b._sum.points ?? 0) - (a._sum.points ?? 0));
    const rankMap: Record<string, number> = {};
    sorted.forEach((s, i) => { rankMap[s.userId] = i + 1; });
    const pointsMap = Object.fromEntries(cumulative.map((s) => [s.userId, s._sum.points ?? 0]));

    for (const m of group.memberships) {
      if (!m.user.email) continue;
      const { subject, html } = tournamentFinalizedEmail(
        tournament.name,
        group.name,
        rankMap[m.userId] ?? group.memberships.length,
        pointsMap[m.userId] ?? 0,
        `${baseUrl}/dashboard/groups/${group.id}`,
        toLocale(m.user.locale),
      );
      sendEmail({ to: m.user.email, subject, html }).catch(() => null);
    }
  }

  return Response.json({ finalized: true, finalizedAt: updated.finalizedAt });
}
