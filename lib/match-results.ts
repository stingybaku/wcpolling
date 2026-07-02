import { prisma } from "@/lib/prisma";
import type { MatchRound } from "@prisma/client";

/**
 * Match-result tracking for the staged tournament: generate the full fixture
 * list, and auto-resolve tie-breakers from the recorded team-level stats.
 *
 * Group fixtures are derived from the canonical group structure (the seeded
 * TournamentGroups + their teams, shared by the staged tournament). Knockout
 * fixtures are synced from the existing StageMatch bracket — recording stats
 * here never touches bracket advancement or prediction scoring.
 */

const ROUND_LABEL_TO_ROUND: Record<string, MatchRound> = {
  R32: "R32",
  R16: "R16",
  QF: "QF",
  SF: "SF",
  Final: "FINAL",
};

/** All unordered pairs of a group's teams (4 teams → 6 round-robin matches). */
function roundRobinPairs(teamIds: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      pairs.push([teamIds[i], teamIds[j]]);
    }
  }
  return pairs;
}

/**
 * Creates/updates the MatchResult rows for a tournament:
 *  - GROUP: round-robin fixtures per seeded group (idempotent).
 *  - Knockout: one row per KNOCKOUT StageMatch, linked by stageMatchId; on re-run,
 *    existing rows have their teams/kickoff re-synced from the (now-resolved)
 *    bracket. Recorded stats are never touched.
 * Safe to re-run as the bracket fills in. Returns how many rows it created and,
 * for knockout, how many existing rows it re-synced.
 */
export async function generateMatchFixtures(
  tournamentId: string,
): Promise<{ groups: number; knockout: number; knockoutResynced: number }> {
  let groups = 0;
  let knockout = 0;
  let knockoutResynced = 0;

  // ── Group stage: round-robin from the canonical (seeded) groups ──
  const tournamentGroups = await prisma.tournamentGroup.findMany({
    where: { teams: { some: {} } },
    include: { teams: { orderBy: { seed: "asc" }, select: { teamId: true } } },
    orderBy: { sortOrder: "asc" },
  });

  for (const group of tournamentGroups) {
    const teamIds = group.teams.map((t) => t.teamId);
    const pairs = roundRobinPairs(teamIds);
    for (let i = 0; i < pairs.length; i++) {
      const [homeTeamId, awayTeamId] = pairs[i];
      const matchNumber = i + 1;
      const existing = await prisma.matchResult.findUnique({
        where: {
          tournamentId_round_groupName_matchNumber: {
            tournamentId,
            round: "GROUP",
            groupName: group.name,
            matchNumber,
          },
        },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.matchResult.create({
        data: { tournamentId, round: "GROUP", groupName: group.name, matchNumber, homeTeamId, awayTeamId },
      });
      groups++;
    }
  }

  // ── Knockout: sync from the StageMatch bracket (teams known) ──
  const stageMatches = await prisma.stageMatch.findMany({
    where: { stage: { tournamentId, type: "KNOCKOUT" } },
    include: { stage: { select: { roundLabel: true } } },
  });

  for (const sm of stageMatches) {
    const round = sm.stage.roundLabel ? ROUND_LABEL_TO_ROUND[sm.stage.roundLabel] : undefined;
    if (!round) continue;
    const existing = await prisma.matchResult.findUnique({
      where: { stageMatchId: sm.id },
      select: { id: true, homeTeamId: true, awayTeamId: true, kickoffAt: true },
    });
    if (existing) {
      // A row created before the bracket resolved can hold TBD/placeholder teams.
      // Re-sync the teams (and kickoff) from the StageMatch, which is the bracket
      // source of truth, so the fixture reflects the current matchup. Recorded
      // stats/status are left untouched, and this table never feeds prediction
      // scoring (that reads StageMatch.winnerId / StageQualificationResult).
      const kickoff = sm.matchDate ?? null;
      const changed =
        existing.homeTeamId !== sm.homeTeamId ||
        existing.awayTeamId !== sm.awayTeamId ||
        (existing.kickoffAt?.getTime() ?? null) !== (kickoff?.getTime() ?? null);
      if (changed) {
        await prisma.matchResult.update({
          where: { stageMatchId: sm.id },
          data: { homeTeamId: sm.homeTeamId, awayTeamId: sm.awayTeamId, kickoffAt: kickoff },
        });
        knockoutResynced++;
      }
      continue;
    }
    await prisma.matchResult.create({
      data: {
        tournamentId,
        round,
        matchNumber: Number.parseInt(sm.matchNumber, 10) || 0,
        homeTeamId: sm.homeTeamId,
        awayTeamId: sm.awayTeamId,
        stageMatchId: sm.id,
        kickoffAt: sm.matchDate,
      },
    });
    knockout++;
  }

  return { groups, knockout, knockoutResynced };
}

/**
 * Fills `correctAnswer` for tie-breaker questions that carry a `metric`, computed
 * from the FINISHED match results. Golden Boot and other player-level questions
 * have no metric and are left for the admin to grade. Returns the values written.
 */
export async function resolveTieBreakers(tournamentId: string): Promise<Record<string, number>> {
  const finished = await prisma.matchResult.findMany({
    where: { tournamentId, status: "FINISHED" },
    select: { round: true, homeScore: true, awayScore: true, homeRed: true, awayRed: true, penaltyShootout: true },
  });

  const totalGoals = finished.reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
  const totalRedCards = finished.reduce((sum, m) => sum + m.homeRed + m.awayRed, 0);
  const penaltyShootouts = finished.filter((m) => m.penaltyShootout).length;
  const finalMatch = finished.find((m) => m.round === "FINAL");
  const finalGoals = finalMatch ? (finalMatch.homeScore ?? 0) + (finalMatch.awayScore ?? 0) : null;

  const questions = await prisma.tieBreakerQuestion.findMany({
    where: { tournamentId, metric: { not: null } },
    select: { id: true, metric: true },
  });

  const written: Record<string, number> = {};
  for (const q of questions) {
    let value: number | null = null;
    switch (q.metric) {
      case "TOTAL_GOALS": value = totalGoals; break;
      case "RED_CARDS": value = totalRedCards; break;
      case "PENALTY_SHOOTOUTS": value = penaltyShootouts; break;
      case "FINAL_GOALS": value = finalGoals; break; // null until the final is played
    }
    if (value === null) continue;
    await prisma.tieBreakerQuestion.update({
      where: { id: q.id },
      data: { correctAnswer: String(value) },
    });
    if (q.metric) written[q.metric] = value;
  }
  return written;
}
