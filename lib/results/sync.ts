import { prisma } from "@/lib/prisma";
import type { MatchRound } from "@prisma/client";
import { createApiFootballProvider } from "@/lib/results/providers/apiFootball";
import { createFootballDataProvider } from "@/lib/results/providers/footballData";
import { buildTeamLookup } from "@/lib/results/team-map";
import { NormalizedMatchResult, ResultsProvider } from "@/lib/results/types";

/**
 * Pulls match RESULTS from an external provider and writes them onto existing
 * MatchResult fixtures. It only ever updates scores / cards / shootout / status
 * on rows the fixtures already created — it never creates fixtures, never touches
 * StageMatch / winnerId / qualifiers, and so never affects the bracket or
 * prediction scoring. Stage results stay a manual, admin-only operation.
 */

const DEFAULT_HOST = "v3.football.api-sports.io";

function pickProvider(): ResultsProvider | null {
  const configured = (process.env.RESULTS_PROVIDER ?? "").trim().toLowerCase();
  const apiFootballKey = process.env.API_FOOTBALL_KEY;
  const footballDataKey = process.env.FOOTBALL_DATA_KEY;

  if (configured === "football-data" && footballDataKey) {
    return createFootballDataProvider({
      apiKey: footballDataKey,
      competition: (process.env.RESULTS_COMPETITION ?? "WC").trim(),
    });
  }
  if ((configured === "api-football" || (!configured && apiFootballKey)) && apiFootballKey) {
    return createApiFootballProvider({
      apiKey: apiFootballKey,
      host: (process.env.API_FOOTBALL_HOST ?? DEFAULT_HOST).trim(),
    });
  }
  // No explicit provider set but a football-data key is present.
  if (!configured && footballDataKey) {
    return createFootballDataProvider({
      apiKey: footballDataKey,
      competition: (process.env.RESULTS_COMPETITION ?? "WC").trim(),
    });
  }
  return null;
}

/** Round + unordered team pair — unique per match, orientation-independent. */
function pairKey(round: MatchRound, teamA: string, teamB: string): string {
  return `${round}:${[teamA, teamB].sort().join("|")}`;
}

type SyncSummary = {
  provider: string;
  fetched: number;
  updated: number;
  unchanged: number;
  skipped: number;
  unmatched: string[];
  cardsFetched: boolean;
};

type MatchResultRow = {
  id: string;
  round: MatchRound;
  homeTeamId: string;
  awayTeamId: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeYellow: number;
  awayYellow: number;
  homeRed: number;
  awayRed: number;
  penaltyShootout: boolean;
  homePenalties: number | null;
  awayPenalties: number | null;
};

export async function syncMatchResults(
  tournamentId: string,
  opts: { withCards?: boolean } = {},
): Promise<SyncSummary> {
  const provider = pickProvider();
  if (!provider) {
    throw new Error(
      "No results provider configured. Set RESULTS_PROVIDER=football-data with FOOTBALL_DATA_KEY (free, covers the World Cup), or =api-football with API_FOOTBALL_KEY (paid plan for 2026).",
    );
  }

  const leagueId = Number(process.env.RESULTS_LEAGUE_ID ?? "1");
  const season = Number(process.env.RESULTS_SEASON ?? "2026");
  const cardBudget = Number(process.env.RESULTS_CARD_BUDGET ?? "40");
  const withCards = opts.withCards ?? false;

  const [teams, rows, fetched] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true, fifaCode: true } }),
    prisma.matchResult.findMany({
      where: { tournamentId },
      select: {
        id: true, round: true, homeTeamId: true, awayTeamId: true, status: true,
        homeScore: true, awayScore: true, homeYellow: true, awayYellow: true,
        homeRed: true, awayRed: true, penaltyShootout: true,
        homePenalties: true, awayPenalties: true,
      },
    }),
    provider.fetchResults({ leagueId, season, withCards, cardBudget }),
  ]);

  const lookup = buildTeamLookup(teams);
  const rowIndex = new Map<string, MatchResultRow>();
  for (const r of rows as MatchResultRow[]) {
    rowIndex.set(pairKey(r.round, r.homeTeamId, r.awayTeamId), r);
  }

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  const unmatched: string[] = [];

  for (const ext of fetched) {
    if (!ext.round) { skipped += 1; continue; }        // untracked (e.g. 3rd place)
    if (ext.status !== "FINISHED") { skipped += 1; continue; } // nothing final to write

    const homeId = lookup.resolve(ext.homeTeamName);
    const awayId = lookup.resolve(ext.awayTeamName);
    if (!homeId || !awayId) {
      unmatched.push(`${ext.homeTeamName} vs ${ext.awayTeamName} (${ext.round}) — team not recognized`);
      continue;
    }

    const row = rowIndex.get(pairKey(ext.round, homeId, awayId));
    if (!row) {
      unmatched.push(`${ext.homeTeamName} vs ${ext.awayTeamName} (${ext.round}) — no matching fixture`);
      continue;
    }

    // The fixture's home/away orientation may be the reverse of the provider's;
    // align every side-specific value to OUR row before comparing/writing.
    const swap = row.homeTeamId !== homeId;
    const oriented = orient(ext, swap);

    const data: Record<string, unknown> = {};
    if (row.homeScore !== oriented.homeScore) data.homeScore = oriented.homeScore;
    if (row.awayScore !== oriented.awayScore) data.awayScore = oriented.awayScore;
    if (row.penaltyShootout !== oriented.penaltyShootout) data.penaltyShootout = oriented.penaltyShootout;
    if (row.homePenalties !== oriented.homePenalties) data.homePenalties = oriented.homePenalties;
    if (row.awayPenalties !== oriented.awayPenalties) data.awayPenalties = oriented.awayPenalties;
    if (row.status !== "FINISHED") data.status = "FINISHED";
    // Card counts only when the provider actually supplied them this pull.
    if (oriented.homeYellow != null && row.homeYellow !== oriented.homeYellow) data.homeYellow = oriented.homeYellow;
    if (oriented.awayYellow != null && row.awayYellow !== oriented.awayYellow) data.awayYellow = oriented.awayYellow;
    if (oriented.homeRed != null && row.homeRed !== oriented.homeRed) data.homeRed = oriented.homeRed;
    if (oriented.awayRed != null && row.awayRed !== oriented.awayRed) data.awayRed = oriented.awayRed;

    if (Object.keys(data).length === 0) { unchanged += 1; continue; }

    await prisma.matchResult.update({ where: { id: row.id }, data });
    updated += 1;
  }

  // Keep tie-breaker "correct answers" (total goals, red cards, …) in step with
  // whatever we just wrote, exactly like the manual per-match editor does.
  if (updated > 0) {
    const { resolveTieBreakers } = await import("@/lib/match-results");
    await resolveTieBreakers(tournamentId).catch(() => null);
  }

  return {
    provider: provider.name,
    fetched: fetched.length,
    updated,
    unchanged,
    skipped,
    unmatched,
    cardsFetched: withCards,
  };
}

function orient(ext: NormalizedMatchResult, swap: boolean) {
  if (!swap) {
    return {
      homeScore: ext.homeScore, awayScore: ext.awayScore,
      penaltyShootout: ext.penaltyShootout,
      homePenalties: ext.homePenalties, awayPenalties: ext.awayPenalties,
      homeYellow: ext.homeYellow, awayYellow: ext.awayYellow,
      homeRed: ext.homeRed, awayRed: ext.awayRed,
    };
  }
  return {
    homeScore: ext.awayScore, awayScore: ext.homeScore,
    penaltyShootout: ext.penaltyShootout,
    homePenalties: ext.awayPenalties, awayPenalties: ext.homePenalties,
    homeYellow: ext.awayYellow, awayYellow: ext.homeYellow,
    homeRed: ext.awayRed, awayRed: ext.homeRed,
  };
}
