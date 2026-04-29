import { MatchStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TournamentSnapshot = Prisma.TournamentGetPayload<{
  include: {
    groups: {
      include: {
        teams: {
          include: {
            team: true;
          };
        };
        matches: true;
      };
    };
    phases: true;
    matches: {
      include: {
        phase: true;
        homeSourceGroup: true;
        awaySourceGroup: true;
        homeSourceMatch: true;
        awaySourceMatch: true;
      };
      orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }, { scheduledAt: "asc" }];
    };
  };
}>;

type TeamGroupStats = {
  teamId: string;
  teamName: string;
  groupName: string;
  points: number;
  goalDiff: number;
  goalsFor: number;
};

function buildGroupStandings(groups: TournamentSnapshot["groups"]): {
  standings: Map<string, string[]>;
  teamStats: Map<string, TeamGroupStats>;
} {
  const standings = new Map<string, string[]>();
  const teamStats = new Map<string, TeamGroupStats>();

  for (const group of groups) {
    const table = new Map<string, { points: number; goalDiff: number; goalsFor: number; name: string }>();
    group.teams.forEach(({ team }) => {
      table.set(team.id, { points: 0, goalDiff: 0, goalsFor: 0, name: team.name });
    });

    for (const match of group.matches) {
      if (
        match.status !== MatchStatus.FINISHED ||
        !match.homeTeamId ||
        !match.awayTeamId ||
        match.homeScore == null ||
        match.awayScore == null
      ) {
        continue;
      }

      const home = table.get(match.homeTeamId);
      const away = table.get(match.awayTeamId);
      if (!home || !away) continue;

      home.goalsFor += match.homeScore;
      away.goalsFor += match.awayScore;
      home.goalDiff += match.homeScore - match.awayScore;
      away.goalDiff += match.awayScore - match.homeScore;

      if (match.homeScore > match.awayScore) {
        home.points += 3;
      } else if (match.homeScore < match.awayScore) {
        away.points += 3;
      } else {
        home.points += 1;
        away.points += 1;
      }
    }

    const ordered = [...table.entries()]
      .sort((a, b) => {
        const [teamIdA, statsA] = a;
        const [teamIdB, statsB] = b;
        return (
          statsB.points - statsA.points ||
          statsB.goalDiff - statsA.goalDiff ||
          statsB.goalsFor - statsA.goalsFor ||
          statsA.name.localeCompare(statsB.name) ||
          teamIdA.localeCompare(teamIdB)
        );
      })
      .map(([teamId]) => teamId);

    standings.set(group.name.trim().toLowerCase(), ordered);

    for (const [teamId, stats] of table.entries()) {
      teamStats.set(teamId, {
        teamId,
        teamName: stats.name,
        groupName: group.name,
        points: stats.points,
        goalDiff: stats.goalDiff,
        goalsFor: stats.goalsFor,
      });
    }
  }

  return { standings, teamStats };
}

/**
 * Ranks all 3rd-place finishers across groups using FIFA's cross-group criteria:
 * 1. Points  2. Goal difference  3. Goals scored  4. Group name (alphabetical fallback)
 *
 * Fair-play points (cards) are not tracked in the schema and are omitted.
 * If considerGroups is provided, only 3rd-place teams from those groups are included.
 */
function buildThirdPlaceRanking(
  groups: TournamentSnapshot["groups"],
  standings: Map<string, string[]>,
  teamStats: Map<string, TeamGroupStats>,
  considerGroups?: string[] | null
): { teamId: string; groupName: string }[] {
  const normalizedFilter = considerGroups?.map((g) => g.trim().toLowerCase());

  const candidates: TeamGroupStats[] = [];

  for (const group of groups) {
    const groupKey = group.name.trim().toLowerCase();
    if (normalizedFilter && !normalizedFilter.includes(groupKey)) continue;

    const ordered = standings.get(groupKey);
    if (!ordered || ordered.length < 3) continue;

    const thirdTeamId = ordered[2];
    const stats = teamStats.get(thirdTeamId);
    if (!stats) continue;

    candidates.push(stats);
  }

  candidates.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDiff - a.goalDiff ||
      b.goalsFor - a.goalsFor ||
      a.groupName.localeCompare(b.groupName)
  );

  return candidates.map((c) => ({ teamId: c.teamId, groupName: c.groupName }));
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildMatchLookup(matches: TournamentSnapshot["matches"]) {
  const byId = new Map<string, TournamentSnapshot["matches"][number]>();
  const byLabel = new Map<string, TournamentSnapshot["matches"][number]>();
  const byPhaseOrdinal = new Map<string, TournamentSnapshot["matches"][number]>();

  const phaseBuckets = new Map<string, TournamentSnapshot["matches"]>();
  matches.forEach((match) => {
    byId.set(match.id, match);
    if (match.label?.trim()) {
      byLabel.set(normalizeText(match.label), match);
    }

    const phaseKey = normalizeText(match.phase.name);
    const current = phaseBuckets.get(phaseKey) ?? [];
    current.push(match);
    phaseBuckets.set(phaseKey, current);
  });

  for (const [phaseKey, phaseMatches] of phaseBuckets.entries()) {
    phaseMatches.forEach((match, index) => {
      byPhaseOrdinal.set(`${phaseKey}:${index + 1}`, match);
      if (match.label?.trim()) {
        byPhaseOrdinal.set(`${normalizeText(match.label)}:${index + 1}`, match);
      }
    });
  }

  return { byId, byLabel, byPhaseOrdinal };
}

function resolveGroupPlaceholder(placeholder: string, standings: Map<string, string[]>) {
  let match = placeholder.match(/^(winner|1st)\s+(group\s+.+)$/);
  if (match) {
    return standings.get(normalizeText(match[2]))?.[0] ?? null;
  }

  match = placeholder.match(/^(runner-up|runner up|2nd)\s+(group\s+.+)$/);
  if (match) {
    return standings.get(normalizeText(match[2]))?.[1] ?? null;
  }

  return null;
}

function resolveKnockoutPlaceholder(
  placeholder: string,
  matches: ReturnType<typeof buildMatchLookup>
) {
  let match = placeholder.match(/^(winner|loser)\s+match\s+([a-z0-9_-]+)$/);
  if (match) {
    const sourceMatch = matches.byId.get(match[2]);
    if (!sourceMatch) return null;
    return match[1] === "winner" ? sourceMatch.winnerId ?? null : sourceMatch.winnerId ? (sourceMatch.homeTeamId === sourceMatch.winnerId ? sourceMatch.awayTeamId : sourceMatch.homeTeamId) : null;
  }

  match = placeholder.match(/^(winner|loser)\s+(.+)$/);
  if (!match) return null;

  const outcome = match[1];
  const target = normalizeText(match[2]);
  const directMatch = matches.byLabel.get(target);
  if (directMatch) {
    if (outcome === "winner") return directMatch.winnerId ?? null;
    return directMatch.winnerId ? (directMatch.homeTeamId === directMatch.winnerId ? directMatch.awayTeamId : directMatch.homeTeamId) : null;
  }

  const ordinalMatch = target.match(/^(.*?)(\d+)$/);
  if (ordinalMatch) {
    const key = `${normalizeText(ordinalMatch[1])}:${Number(ordinalMatch[2])}`;
    const phaseMatch = matches.byPhaseOrdinal.get(key);
    if (phaseMatch) {
      if (outcome === "winner") return phaseMatch.winnerId ?? null;
      return phaseMatch.winnerId ? (phaseMatch.homeTeamId === phaseMatch.winnerId ? phaseMatch.awayTeamId : phaseMatch.homeTeamId) : null;
    }
  }

  return null;
}

function resolvePlaceholderTeamId(
  placeholder: string | null | undefined,
  standings: Map<string, string[]>,
  matches: ReturnType<typeof buildMatchLookup>
) {
  if (!placeholder) return null;
  const normalized = normalizeText(placeholder);

  return resolveGroupPlaceholder(normalized, standings) ?? resolveKnockoutPlaceholder(normalized, matches);
}

function resolveStructuredSource(
  source: {
    sourceType: "TEAM" | "GROUP_POSITION" | "MATCH_RESULT" | "PLACEHOLDER" | "BEST_THIRD";
    currentTeamId: string | null;
    placeholder: string | null;
    sourceGroup?: { name: string } | null;
    sourcePosition: number | null;
    sourceMatch?: { winnerId: string | null; homeTeamId: string | null; awayTeamId: string | null } | null;
    sourceOutcome: "WINNER" | "LOSER" | null;
    sourceThirdRank: number | null;
    sourceThirdGroups: string | null;
  },
  standings: Map<string, string[]>,
  matches: ReturnType<typeof buildMatchLookup>,
  thirdPlaceRanking: { teamId: string; groupName: string }[]
) {
  switch (source.sourceType) {
    case "TEAM":
      return source.currentTeamId;
    case "GROUP_POSITION": {
      if (!source.sourceGroup || !source.sourcePosition) return source.currentTeamId;
      const ordered = standings.get(normalizeText(source.sourceGroup.name));
      return ordered?.[source.sourcePosition - 1] ?? source.currentTeamId;
    }
    case "MATCH_RESULT": {
      if (!source.sourceMatch || !source.sourceOutcome) return source.currentTeamId;
      if (source.sourceOutcome === "WINNER") return source.sourceMatch.winnerId ?? source.currentTeamId;
      return source.sourceMatch.winnerId
        ? source.sourceMatch.homeTeamId === source.sourceMatch.winnerId
          ? source.sourceMatch.awayTeamId
          : source.sourceMatch.homeTeamId
        : source.currentTeamId;
    }
    case "PLACEHOLDER":
      return resolvePlaceholderTeamId(source.placeholder, standings, matches) ?? source.currentTeamId;
    case "BEST_THIRD": {
      const rank = source.sourceThirdRank;
      if (!rank || rank < 1) return source.currentTeamId;

      let ranking = thirdPlaceRanking;
      if (source.sourceThirdGroups) {
        const allowedGroups = source.sourceThirdGroups
          .split(",")
          .map((g) => g.trim().toLowerCase())
          .filter(Boolean);
        if (allowedGroups.length > 0) {
          ranking = ranking.filter((r) => allowedGroups.includes(r.groupName.trim().toLowerCase()));
        }
      }

      return ranking[rank - 1]?.teamId ?? source.currentTeamId;
    }
    default:
      return source.currentTeamId;
  }
}

export async function resolveTournamentBracketParticipants(tournamentId: string) {
  const snapshot = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      groups: {
        include: {
          teams: {
            include: { team: true },
          },
          matches: true,
        },
      },
      phases: true,
      matches: {
        include: {
          phase: true,
          homeSourceGroup: true,
          awaySourceGroup: true,
          homeSourceMatch: true,
          awaySourceMatch: true,
        },
        orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }, { scheduledAt: "asc" }],
      },
    },
  });

  if (!snapshot) return 0;

  const { standings, teamStats } = buildGroupStandings(snapshot.groups);
  const thirdPlaceRanking = buildThirdPlaceRanking(snapshot.groups, standings, teamStats);
  let updatedCount = 0;

  for (let i = 0; i < snapshot.matches.length; i += 1) {
    const lookup = buildMatchLookup(snapshot.matches);
    let changedThisPass = false;

    for (const match of snapshot.matches.filter((item) => item.phase.isKnockout)) {
      const nextHomeTeamId = resolveStructuredSource(
        {
          sourceType: match.homeSourceType,
          currentTeamId: match.homeTeamId,
          placeholder: match.homePlaceholder,
          sourceGroup: match.homeSourceGroup,
          sourcePosition: match.homeSourcePosition,
          sourceMatch: match.homeSourceMatch,
          sourceOutcome: match.homeSourceOutcome,
          sourceThirdRank: match.homeSourceThirdRank,
          sourceThirdGroups: match.homeSourceThirdGroups,
        },
        standings,
        lookup,
        thirdPlaceRanking
      );
      const nextAwayTeamId = resolveStructuredSource(
        {
          sourceType: match.awaySourceType,
          currentTeamId: match.awayTeamId,
          placeholder: match.awayPlaceholder,
          sourceGroup: match.awaySourceGroup,
          sourcePosition: match.awaySourcePosition,
          sourceMatch: match.awaySourceMatch,
          sourceOutcome: match.awaySourceOutcome,
          sourceThirdRank: match.awaySourceThirdRank,
          sourceThirdGroups: match.awaySourceThirdGroups,
        },
        standings,
        lookup,
        thirdPlaceRanking
      );

      if (nextHomeTeamId === match.homeTeamId && nextAwayTeamId === match.awayTeamId) {
        continue;
      }

      const updated = await prisma.match.update({
        where: { id: match.id },
        data: {
          homeTeamId: nextHomeTeamId,
          awayTeamId: nextAwayTeamId,
        },
        include: {
          phase: true,
          homeSourceGroup: true,
          awaySourceGroup: true,
          homeSourceMatch: true,
          awaySourceMatch: true,
        },
      });

      const index = snapshot.matches.findIndex((item) => item.id === updated.id);
      snapshot.matches[index] = updated;
      updatedCount += 1;
      changedThisPass = true;
    }

    if (!changedThisPass) break;
  }

  return updatedCount;
}

/**
 * Returns the current 3rd-place ranking for a tournament, useful for
 * admin inspection before/after bracket resolution.
 */
export async function getTournamentThirdPlaceRanking(
  tournamentId: string
): Promise<{ rank: number; teamId: string; teamName: string; groupName: string; points: number; goalDiff: number; goalsFor: number }[]> {
  const snapshot = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      groups: {
        include: {
          teams: { include: { team: true } },
          matches: true,
        },
      },
    },
  });

  if (!snapshot) return [];

  const { standings, teamStats } = buildGroupStandings(snapshot.groups);
  const ranking = buildThirdPlaceRanking(snapshot.groups, standings, teamStats);

  return ranking.map((entry, index) => {
    const stats = teamStats.get(entry.teamId)!;
    return {
      rank: index + 1,
      teamId: entry.teamId,
      teamName: stats.teamName,
      groupName: entry.groupName,
      points: stats.points,
      goalDiff: stats.goalDiff,
      goalsFor: stats.goalsFor,
    };
  });
}
