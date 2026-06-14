import { prisma } from "@/lib/prisma";

/**
 * Badge slugs — the single source of truth shared by the DB catalog
 * (`Badge.slug`), the i18n keys (`badges.<slug>.name` / `.desc`) and the
 * award logic below.
 */
export const BADGE_SLUGS = {
  CLEAN_SWEEP: "clean_sweep",
  STAGE_MVP: "stage_mvp",
  HOT_STREAK: "hot_streak",
  EVER_PRESENT: "ever_present",
  LOCKED_IN: "locked_in",
  TOP_OF_TABLE: "top_of_table",
} as const;

/** Number of consecutive scoring stages required for the Hot Streak badge. */
export const HOT_STREAK_LENGTH = 3;

async function loadBadgeIds(): Promise<Map<string, string>> {
  const badges = await prisma.badge.findMany({
    where: { active: true },
    select: { id: true, slug: true },
  });
  return new Map(badges.map((b) => [b.slug, b.id]));
}

type AwardArgs = {
  slug: string;
  userId: string;
  groupId: string;
  tournamentId: string;
  stageId?: string | null;
  params?: Record<string, number>;
};

/**
 * Idempotently grants a badge. `contextKey` is the stageId for stage-scoped
 * badges and the literal "tournament" for tournament-scoped ones, so re-running
 * an evaluator never creates duplicates (it just refreshes `params`).
 */
async function award(badgeIds: Map<string, string>, a: AwardArgs): Promise<void> {
  const badgeId = badgeIds.get(a.slug);
  if (!badgeId) return; // catalog not seeded for this slug — skip silently
  const stageId = a.stageId ?? null;
  const contextKey = stageId ?? "tournament";
  await prisma.userBadge.upsert({
    where: {
      userId_badgeId_groupId_contextKey: {
        userId: a.userId,
        badgeId,
        groupId: a.groupId,
        contextKey,
      },
    },
    create: {
      userId: a.userId,
      badgeId,
      groupId: a.groupId,
      tournamentId: a.tournamentId,
      stageId,
      contextKey,
      ...(a.params ? { params: a.params } : {}),
    },
    update: a.params ? { params: a.params } : {},
  });
}

/**
 * Stage-scoped badges, evaluated after a stage is scored: Clean Sweep,
 * Stage MVP, Hot Streak. Safe to re-run when results change.
 */
export async function evaluateStageBadges(stageId: string): Promise<void> {
  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) return;

  const badgeIds = await loadBadgeIds();
  if (badgeIds.size === 0) return;

  // "Perfect stage" target depends on the stage type.
  let qualifierCount = 0;
  let matchCount = 0;
  if (stage.type === "GROUP_QUALIFICATION") {
    const qr = await prisma.stageQualificationResult.findUnique({ where: { stageId } });
    qualifierCount = Array.isArray(qr?.qualifiers) ? (qr!.qualifiers as unknown[]).length : 0;
  } else if (stage.type === "KNOCKOUT") {
    matchCount = await prisma.stageMatch.count({ where: { stageId, winnerId: { not: null } } });
  }

  // The stages making up a streak: this stage plus the prior N-1 by order.
  const streakStages = await prisma.tournamentStage.findMany({
    where: { tournamentId: stage.tournamentId, order: { lte: stage.order } },
    orderBy: { order: "desc" },
    take: HOT_STREAK_LENGTH,
    select: { id: true },
  });
  const streakStageIds = streakStages.map((s) => s.id);
  const streakReady = streakStageIds.length === HOT_STREAK_LENGTH;

  const groups = await prisma.groupRoom.findMany({
    where: { tournamentId: stage.tournamentId },
    select: { id: true },
  });

  for (const group of groups) {
    const members = await prisma.groupMembership.findMany({
      where: { groupId: group.id, isActive: true },
      select: { userId: true },
    });
    if (members.length === 0) continue;
    const memberIds = members.map((m) => m.userId);

    const scores = await prisma.stageScore.findMany({
      where: { stageId, groupId: group.id, userId: { in: memberIds } },
    });

    // Clean Sweep — every gradeable pick correct.
    for (const score of scores) {
      const b = (score.breakdown ?? {}) as Record<string, number>;
      let perfect = false;
      if (stage.type === "GROUP_QUALIFICATION") {
        perfect = qualifierCount > 0 && (b.correct ?? 0) === qualifierCount && (b.incorrect ?? 0) === 0;
      } else if (stage.type === "KNOCKOUT") {
        perfect = matchCount > 0 && score.correctPicks === matchCount;
      }
      if (perfect) {
        await award(badgeIds, {
          slug: BADGE_SLUGS.CLEAN_SWEEP,
          userId: score.userId,
          groupId: group.id,
          tournamentId: stage.tournamentId,
          stageId,
        });
      }
    }

    // Stage MVP — top scorer(s) in this group for this stage (must have scored).
    const maxPoints = scores.reduce((m, s) => Math.max(m, s.points), 0);
    if (maxPoints > 0) {
      for (const score of scores.filter((s) => s.points === maxPoints)) {
        await award(badgeIds, {
          slug: BADGE_SLUGS.STAGE_MVP,
          userId: score.userId,
          groupId: group.id,
          tournamentId: stage.tournamentId,
          stageId,
          params: { points: maxPoints },
        });
      }
    }

    // Hot Streak — scored (>0) in each of the last N consecutive stages.
    if (streakReady) {
      const streakScores = await prisma.stageScore.findMany({
        where: {
          groupId: group.id,
          stageId: { in: streakStageIds },
          userId: { in: memberIds },
          points: { gt: 0 },
        },
        select: { userId: true, stageId: true },
      });
      const byUser = new Map<string, Set<string>>();
      for (const s of streakScores) {
        if (!byUser.has(s.userId)) byUser.set(s.userId, new Set());
        byUser.get(s.userId)!.add(s.stageId);
      }
      for (const [userId, stageSet] of byUser) {
        if (stageSet.size === HOT_STREAK_LENGTH) {
          await award(badgeIds, {
            slug: BADGE_SLUGS.HOT_STREAK,
            userId,
            groupId: group.id,
            tournamentId: stage.tournamentId,
            stageId,
            params: { count: HOT_STREAK_LENGTH },
          });
        }
      }
    }
  }
}

/**
 * Tournament-scoped badges, evaluated on finalize: Ever-Present, Locked In,
 * Top of the Table. Safe to re-run.
 */
export async function evaluateTournamentBadges(tournamentId: string): Promise<void> {
  const badgeIds = await loadBadgeIds();
  if (badgeIds.size === 0) return;

  const stages = await prisma.tournamentStage.findMany({
    where: { tournamentId },
    select: { id: true },
  });
  const stageIds = stages.map((s) => s.id);
  const stageCount = stageIds.length;
  if (stageCount === 0) return;

  const groups = await prisma.groupRoom.findMany({
    where: { tournamentId },
    select: { id: true },
  });

  for (const group of groups) {
    const members = await prisma.groupMembership.findMany({
      where: { groupId: group.id, isActive: true },
      select: { userId: true },
    });
    if (members.length === 0) continue;
    const memberIds = members.map((m) => m.userId);

    // Final ranking by cumulative points.
    const cumulative = await prisma.stageScore.groupBy({
      by: ["userId"],
      where: { groupId: group.id, userId: { in: memberIds } },
      _sum: { points: true },
    });
    const sorted = [...cumulative].sort((a, b) => (b._sum.points ?? 0) - (a._sum.points ?? 0));
    const topPoints = sorted.length > 0 ? sorted[0]._sum.points ?? 0 : 0;

    // Top of the Table — rank #1 (ties included), must have scored.
    if (topPoints > 0) {
      for (const row of sorted.filter((r) => (r._sum.points ?? 0) === topPoints)) {
        await award(badgeIds, {
          slug: BADGE_SLUGS.TOP_OF_TABLE,
          userId: row.userId,
          groupId: group.id,
          tournamentId,
          params: { points: topPoints },
        });
      }
    }

    // Per-user submission + unlock totals across all stages of this group.
    const predictions = await prisma.stagePrediction.findMany({
      where: { groupId: group.id, stageId: { in: stageIds }, userId: { in: memberIds } },
      select: { userId: true, stageId: true, submittedAt: true, unlockCount: true },
    });
    const submittedStages = new Map<string, Set<string>>();
    const unlockTotal = new Map<string, number>();
    for (const p of predictions) {
      if (p.submittedAt) {
        if (!submittedStages.has(p.userId)) submittedStages.set(p.userId, new Set());
        submittedStages.get(p.userId)!.add(p.stageId);
      }
      unlockTotal.set(p.userId, (unlockTotal.get(p.userId) ?? 0) + p.unlockCount);
    }

    for (const userId of memberIds) {
      const submittedCount = submittedStages.get(userId)?.size ?? 0;

      // Ever-Present — submitted a prediction in every stage.
      if (submittedCount === stageCount) {
        await award(badgeIds, {
          slug: BADGE_SLUGS.EVER_PRESENT,
          userId,
          groupId: group.id,
          tournamentId,
        });
      }

      // Locked In — zero unlocks all tournament, and actually participated.
      if (submittedCount > 0 && (unlockTotal.get(userId) ?? 0) === 0) {
        await award(badgeIds, {
          slug: BADGE_SLUGS.LOCKED_IN,
          userId,
          groupId: group.id,
          tournamentId,
        });
      }
    }
  }
}
