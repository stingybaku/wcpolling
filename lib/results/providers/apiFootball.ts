import type { MatchRound } from "@prisma/client";
import { NormalizedMatchResult, ResultsProvider, ResultsSyncContext } from "@/lib/results/types";

/**
 * API-Football (api-sports.io) results provider.
 *
 * Scores/status/shootouts come from a SINGLE `/fixtures?league&season` call, so
 * a normal pull costs one request. Card counts require one extra
 * `/fixtures/events?fixture=<id>` call per finished match, so they're gated by a
 * budget (see ResultsSyncContext.cardBudget) to respect the free-tier quota.
 *
 * Auth works both directly (host `v3.football.api-sports.io`, header
 * `x-apisports-key`) and via RapidAPI (host `api-football-v1.p.rapidapi.com`,
 * headers `x-rapidapi-key` + `x-rapidapi-host`), chosen from the host env.
 */

type FixtureNode = {
  fixture?: { id?: number; date?: string | null; status?: { short?: string | null } | null } | null;
  league?: { round?: string | null } | null;
  teams?: { home?: { name?: string | null } | null; away?: { name?: string | null } | null } | null;
  goals?: { home?: number | null; away?: number | null } | null;
  score?: { penalty?: { home?: number | null; away?: number | null } | null } | null;
};

type EventNode = {
  team?: { name?: string | null } | null;
  type?: string | null;
  detail?: string | null;
};

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

function mapRound(round: string | null | undefined): MatchRound | null {
  if (!round) return null;
  const r = round.toLowerCase();
  if (r.includes("3rd place") || r.includes("third place") || r.includes("play-off")) return null;
  if (r.startsWith("group")) return "GROUP";
  if (r.includes("round of 32")) return "R32";
  if (r.includes("round of 16")) return "R16";
  if (r.includes("quarter")) return "QF";
  if (r.includes("semi")) return "SF";
  if (r.includes("final")) return "FINAL";
  return null;
}

export function createApiFootballProvider(config: {
  apiKey: string;
  host: string;
}): ResultsProvider {
  const { apiKey, host } = config;
  const isRapid = host.includes("rapidapi");
  // On the direct api-sports host the version lives in the subdomain
  // (v3.football.api-sports.io) with no /v3 path; only RapidAPI puts /v3 in the
  // path. Appending /v3 to the direct host yields /v3/fixtures → 404.
  const baseUrl = isRapid ? `https://${host}/v3` : `https://${host}`;
  const headers: Record<string, string> = isRapid
    ? { "x-rapidapi-key": apiKey, "x-rapidapi-host": host }
    : { "x-apisports-key": apiKey };

  async function apiGet<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { headers, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`API-Football ${path} failed: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    const errors = json?.errors;
    if (errors && ((Array.isArray(errors) && errors.length) || (typeof errors === "object" && Object.keys(errors).length))) {
      const msg = Array.isArray(errors) ? errors[0] : Object.values(errors)[0];
      throw new Error(`API-Football ${path} error: ${msg}`);
    }
    return json?.response as T;
  }

  async function fetchCardCounts(fixtureId: number): Promise<Map<string, { yellow: number; red: number }>> {
    const events = await apiGet<EventNode[]>(`/fixtures/events?fixture=${fixtureId}`);
    const counts = new Map<string, { yellow: number; red: number }>();
    for (const ev of events ?? []) {
      if ((ev.type ?? "").toLowerCase() !== "card") continue;
      const teamName = ev.team?.name ?? "";
      if (!teamName) continue;
      const entry = counts.get(teamName) ?? { yellow: 0, red: 0 };
      const detail = (ev.detail ?? "").toLowerCase();
      if (detail.includes("red") || detail.includes("second yellow")) entry.red += 1;
      else if (detail.includes("yellow")) entry.yellow += 1;
      counts.set(teamName, entry);
    }
    return counts;
  }

  return {
    name: "api-football",
    async fetchResults(ctx: ResultsSyncContext): Promise<NormalizedMatchResult[]> {
      const fixtures = await apiGet<FixtureNode[]>(
        `/fixtures?league=${ctx.leagueId}&season=${ctx.season}`,
      );

      const normalized: NormalizedMatchResult[] = [];
      // Spend the card budget on finished matches only, in chronological order.
      let cardsLeft = ctx.withCards ? Math.max(0, ctx.cardBudget) : 0;

      const nodes = (fixtures ?? []).slice().sort((a, b) => {
        const da = a.fixture?.date ? Date.parse(a.fixture.date) : 0;
        const db = b.fixture?.date ? Date.parse(b.fixture.date) : 0;
        return da - db;
      });

      for (const node of nodes) {
        const fixtureId = node.fixture?.id;
        const homeName = node.teams?.home?.name ?? null;
        const awayName = node.teams?.away?.name ?? null;
        if (!fixtureId || !homeName || !awayName) continue;

        const statusShort = node.fixture?.status?.short ?? "";
        const status = FINISHED_STATUSES.has(statusShort) ? "FINISHED" : "SCHEDULED";
        const penaltyHome = node.score?.penalty?.home ?? null;
        const penaltyAway = node.score?.penalty?.away ?? null;

        let homeYellow: number | null = null;
        let awayYellow: number | null = null;
        let homeRed: number | null = null;
        let awayRed: number | null = null;
        if (status === "FINISHED" && cardsLeft > 0) {
          try {
            const counts = await fetchCardCounts(fixtureId);
            homeYellow = counts.get(homeName)?.yellow ?? 0;
            awayYellow = counts.get(awayName)?.yellow ?? 0;
            homeRed = counts.get(homeName)?.red ?? 0;
            awayRed = counts.get(awayName)?.red ?? 0;
          } catch {
            // A single fixture's events failing shouldn't abort the whole pull.
          }
          cardsLeft -= 1;
        }

        normalized.push({
          providerFixtureId: String(fixtureId),
          round: mapRound(node.league?.round),
          homeTeamName: homeName,
          awayTeamName: awayName,
          kickoffAt: node.fixture?.date ? new Date(node.fixture.date) : null,
          status,
          homeScore: node.goals?.home ?? null,
          awayScore: node.goals?.away ?? null,
          penaltyShootout: penaltyHome != null || penaltyAway != null,
          homePenalties: penaltyHome,
          awayPenalties: penaltyAway,
          homeYellow,
          awayYellow,
          homeRed,
          awayRed,
        });
      }

      return normalized;
    },
  };
}
