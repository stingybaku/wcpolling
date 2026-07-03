import type { MatchRound } from "@prisma/client";
import { NormalizedMatchResult, ResultsProvider } from "@/lib/results/types";

/**
 * football-data.org (v4) results provider.
 *
 * Its free tier covers the FIFA World Cup, so a single
 * `/competitions/{code}/matches` call returns every fixture with scores, stage,
 * and shootout flag — one request per pull, well within the 10 req/min limit.
 *
 * The free tier does NOT expose card-level events, so card counts are always
 * left null (the sync then leaves existing card values untouched). Penalty
 * shootouts ARE provided: `score.fullTime` is the aggregate that includes the
 * shootout, and `score.penalties` carries the shootout tally — so we subtract
 * penalties from fullTime to store the true match score, and record the tally
 * separately.
 *
 * Auth: header `X-Auth-Token: <key>`.
 */

type MatchNode = {
  id?: number;
  utcDate?: string | null;
  status?: string | null;
  stage?: string | null;
  homeTeam?: { name?: string | null; tla?: string | null } | null;
  awayTeam?: { name?: string | null; tla?: string | null } | null;
  score?: {
    duration?: string | null;
    fullTime?: SidePair | null;
    regularTime?: SidePair | null;
    extraTime?: SidePair | null;
    penalties?: SidePair | null;
  } | null;
};

// v4 uses `home`/`away`, but some docs/examples show `homeTeam`/`awayTeam`;
// read either so a key-naming quirk can't silently drop scores.
type SidePair = {
  home?: number | null;
  away?: number | null;
  homeTeam?: number | null;
  awayTeam?: number | null;
} | null;

function side(pair: SidePair): { home: number | null; away: number | null } {
  return {
    home: pair?.home ?? pair?.homeTeam ?? null,
    away: pair?.away ?? pair?.awayTeam ?? null,
  };
}

const STAGE_TO_ROUND: Record<string, MatchRound | null> = {
  GROUP_STAGE: "GROUP",
  LAST_32: "R32",
  LAST_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  FINAL: "FINAL",
  THIRD_PLACE: null, // not tracked
};

function mapStage(stage: string | null | undefined): MatchRound | null {
  if (!stage) return null;
  return STAGE_TO_ROUND[stage.toUpperCase()] ?? null;
}

export function createFootballDataProvider(config: {
  apiKey: string;
  competition: string;
}): ResultsProvider {
  const { apiKey, competition } = config;
  const baseUrl = "https://api.football-data.org/v4";
  const headers = { "X-Auth-Token": apiKey };

  return {
    name: "football-data",
    async fetchResults(): Promise<NormalizedMatchResult[]> {
      const res = await fetch(`${baseUrl}/competitions/${competition}/matches`, {
        headers,
        cache: "no-store",
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = await res.json();
          if (body?.message) detail = body.message;
        } catch { /* keep statusText */ }
        throw new Error(`football-data /competitions/${competition}/matches failed: ${res.status} ${detail}`);
      }
      const json = await res.json();
      const matches: MatchNode[] = json?.matches ?? [];

      const normalized: NormalizedMatchResult[] = [];
      for (const m of matches) {
        const homeName = m.homeTeam?.name ?? null;
        const awayName = m.awayTeam?.name ?? null;
        if (!m.id || !homeName || !awayName) continue;

        // v4's `fullTime` is the AGGREGATE and INCLUDES shootout goals
        // (e.g. a 1-1 won on pens shows fullTime 7-6). We want the match score
        // WITHOUT the shootout, so subtract `penalties` from `fullTime` when a
        // shootout happened; the shootout tally goes in the penalty fields.
        const fullTime = side(m.score?.fullTime ?? null);
        const penalties = side(m.score?.penalties ?? null);
        const hasShootout =
          (m.score?.duration ?? "").toUpperCase() === "PENALTY_SHOOTOUT" ||
          penalties.home != null || penalties.away != null;

        const homeScore = hasShootout
          ? (fullTime.home ?? 0) - (penalties.home ?? 0)
          : fullTime.home;
        const awayScore = hasShootout
          ? (fullTime.away ?? 0) - (penalties.away ?? 0)
          : fullTime.away;

        normalized.push({
          providerFixtureId: String(m.id),
          round: mapStage(m.stage),
          homeTeamName: homeName,
          awayTeamName: awayName,
          kickoffAt: m.utcDate ? new Date(m.utcDate) : null,
          status: (m.status ?? "").toUpperCase() === "FINISHED" ? "FINISHED" : "SCHEDULED",
          homeScore,
          awayScore,
          penaltyShootout: hasShootout,
          homePenalties: hasShootout ? penalties.home : null,
          awayPenalties: hasShootout ? penalties.away : null,
          homeYellow: null,
          awayYellow: null,
          homeRed: null,
          awayRed: null,
        });
      }
      return normalized;
    },
  };
}
