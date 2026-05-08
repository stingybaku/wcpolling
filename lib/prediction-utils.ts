import {
  lookupThirdPlaceScenario,
  THIRD_PLACE_MATCH_SLOTS,
  ThirdPlaceSlot,
} from "@/lib/third-place-scenarios";

export type PredictionTeam = { id: string; name: string; fifaCode: string };

export type PredictionMatch = {
  id: string;
  label?: string | null;
  sortOrder: number;
  phase: { id: string; name: string; slug: string; sortOrder: number; isKnockout: boolean };
  group?: { id: string; name: string } | null;
  homeTeam?: PredictionTeam | null;
  awayTeam?: PredictionTeam | null;
  homeSourceType: string;
  awaySourceType: string;
  homeSourceMatchId?: string | null;
  awaySourceMatchId?: string | null;
  homeSourceGroupId?: string | null;
  awaySourceGroupId?: string | null;
  homeSourcePosition?: number | null;
  awaySourcePosition?: number | null;
  homeSourceGroup?: { name: string } | null;
  awaySourceGroup?: { name: string } | null;
};

export type PredictionGroup = {
  id: string;
  name: string;
  sortOrder: number;
  teams: { team: PredictionTeam }[];
};

export function computeResolvedTeams(
  matches: PredictionMatch[],
  groups: PredictionGroup[],
  groupStandings: Record<string, string[]>,
  thirdPlaceRanking: string[],
  knockoutPicks: Record<string, string>
): Record<string, { home: string | null; away: string | null }> {
  const groupByName = new Map(groups.map((g) => [g.name.toUpperCase(), g]));
  const teamToGroupName = new Map<string, string>();
  for (const group of groups) {
    for (const { team } of group.teams) {
      teamToGroupName.set(team.id, group.name.toUpperCase());
    }
  }

  const top8 = thirdPlaceRanking.slice(0, 8);
  const top8Letters = top8
    .map((id) => teamToGroupName.get(id))
    .filter((g): g is string => !!g);
  const scenario =
    top8Letters.length === 8 ? lookupThirdPlaceScenario(top8Letters) : null;

  const result: Record<string, { home: string | null; away: string | null }> = {};

  for (const match of matches) {
    if (!match.phase.isKnockout) continue;

    let home: string | null = null;
    let away: string | null = null;

    if (
      match.homeSourceType === "GROUP_POSITION" &&
      match.homeSourceGroupId &&
      match.homeSourcePosition
    ) {
      home =
        groupStandings[match.homeSourceGroupId]?.[match.homeSourcePosition - 1] ?? null;
    }
    if (
      match.awaySourceType === "GROUP_POSITION" &&
      match.awaySourceGroupId &&
      match.awaySourcePosition
    ) {
      away =
        groupStandings[match.awaySourceGroupId]?.[match.awaySourcePosition - 1] ?? null;
    }

    const label = match.label?.trim() ?? "";
    const isThirdSlot = THIRD_PLACE_MATCH_SLOTS.includes(label as ThirdPlaceSlot);
    if (scenario && isThirdSlot) {
      const slot = label as ThirdPlaceSlot;
      const ref = scenario[slot];
      const letter = ref.slice(1).toUpperCase();
      const group = groupByName.get(letter);
      if (group) {
        const teamId = groupStandings[group.id]?.[2] ?? null;
        if (match.homeSourceType === "BEST_THIRD") home = teamId;
        if (match.awaySourceType === "BEST_THIRD") away = teamId;
      }
    }

    if (match.homeSourceType === "MATCH_RESULT" && match.homeSourceMatchId) {
      home = knockoutPicks[match.homeSourceMatchId] ?? null;
    }
    if (match.awaySourceType === "MATCH_RESULT" && match.awaySourceMatchId) {
      away = knockoutPicks[match.awaySourceMatchId] ?? null;
    }

    result[match.id] = { home, away };
  }

  return result;
}

/** Build groupStandings map from a prediction's groupStandings array. */
export function buildGroupStandingsMap(
  standingsArr: { groupId: string; teamId: string; position: number }[]
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const s of standingsArr) {
    if (!map[s.groupId]) map[s.groupId] = [];
    map[s.groupId][s.position - 1] = s.teamId;
  }
  return map;
}

/** Build knockoutPicks map from a prediction's entries (score-encoded winner). */
export function buildKnockoutPicksMap(
  entries: {
    matchId: string;
    predictedHomeTeamId?: string | null;
    predictedAwayTeamId?: string | null;
    predictedHomeScore?: number | null;
    predictedAwayScore?: number | null;
    match: { phase: { isKnockout: boolean } };
  }[]
): Record<string, string> {
  const picks: Record<string, string> = {};
  for (const e of entries) {
    if (!e.match.phase.isKnockout) continue;
    const hs = e.predictedHomeScore;
    const as_ = e.predictedAwayScore;
    if (hs != null && as_ != null && hs !== as_) {
      const winner = hs > as_ ? e.predictedHomeTeamId : e.predictedAwayTeamId;
      if (winner) picks[e.matchId] = winner;
    }
  }
  return picks;
}

/** Infer third-place ranking from group standings + R32 entries. */
export function inferThirdPlaceRanking(
  groups: PredictionGroup[],
  groupStandings: Record<string, string[]>,
  entries: {
    matchId: string;
    predictedHomeTeamId?: string | null;
    predictedAwayTeamId?: string | null;
    match: { phase: { isKnockout: boolean }; homeSourceType?: string; awaySourceType?: string };
  }[]
): string[] {
  // Find which third-place teams appear in R32 entries (they qualified)
  const qualifiedThirds = new Set<string>();
  for (const e of entries) {
    if (!e.match.phase.isKnockout) continue;
    if (e.match.awaySourceType === "BEST_THIRD" && e.predictedAwayTeamId) {
      qualifiedThirds.add(e.predictedAwayTeamId);
    }
    if (e.match.homeSourceType === "BEST_THIRD" && e.predictedHomeTeamId) {
      qualifiedThirds.add(e.predictedHomeTeamId);
    }
  }

  const qualifiedArr: string[] = [];
  const eliminatedArr: string[] = [];
  for (const group of groups) {
    const thirdId = groupStandings[group.id]?.[2];
    if (!thirdId) continue;
    if (qualifiedThirds.has(thirdId)) {
      qualifiedArr.push(thirdId);
    } else {
      eliminatedArr.push(thirdId);
    }
  }
  return [...qualifiedArr, ...eliminatedArr];
}
