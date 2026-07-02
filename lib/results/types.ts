import type { MatchRound } from "@prisma/client";

/**
 * A single match's result as reported by an external provider, normalized to the
 * shape our MatchResult table needs. `round` is null for matches we don't track
 * (e.g. a third-place play-off), which the sync skips.
 *
 * Scores are the final result INCLUDING extra time but EXCLUDING any penalty
 * shootout (the shootout is carried separately in penalty*). Card counts are
 * null when the provider wasn't asked for (or couldn't supply) event detail, so
 * the sync knows to leave existing card values untouched rather than zero them.
 */
export type NormalizedMatchResult = {
  providerFixtureId: string;
  round: MatchRound | null;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date | null;
  status: "SCHEDULED" | "FINISHED";
  homeScore: number | null;
  awayScore: number | null;
  penaltyShootout: boolean;
  homePenalties: number | null;
  awayPenalties: number | null;
  homeYellow: number | null;
  awayYellow: number | null;
  homeRed: number | null;
  awayRed: number | null;
};

export type ResultsSyncContext = {
  /** Provider competition id (API-Football league id; World Cup = 1). */
  leagueId: number;
  /** Provider season (kickoff year, e.g. 2026). */
  season: number;
  /** When true, spend up to `cardBudget` extra requests fetching card events. */
  withCards: boolean;
  /** Max per-fixture card-event requests to make in one pull (rate-limit guard). */
  cardBudget: number;
};

export type ResultsProvider = {
  name: string;
  fetchResults(context: ResultsSyncContext): Promise<NormalizedMatchResult[]>;
};
