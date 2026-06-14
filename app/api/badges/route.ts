import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized } from "@/app/api/helpers";

/** Current user's earned badges, with context resolved for i18n interpolation. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const userBadges = await prisma.userBadge.findMany({
    where: { userId: user.id },
    orderBy: { awardedAt: "desc" },
    include: {
      badge: { select: { slug: true, icon: true, category: true } },
      group: { select: { name: true } },
      tournament: { select: { name: true } },
      stage: { select: { name: true, roundLabel: true } },
    },
  });

  const badges = userBadges.map((ub) => ({
    slug: ub.badge.slug,
    icon: ub.badge.icon,
    category: ub.badge.category,
    groupName: ub.group?.name ?? null,
    tournamentName: ub.tournament?.name ?? null,
    stageName: ub.stage?.name ?? null,
    stageRoundLabel: ub.stage?.roundLabel ?? null,
    params: ub.params ?? null,
    awardedAt: ub.awardedAt,
  }));

  return Response.json({ badges });
}
