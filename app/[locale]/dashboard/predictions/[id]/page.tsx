"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import { flagEmoji } from "@/lib/fifa-flags";
import {
  buildGroupStandingsMap,
  buildKnockoutPicksMap,
  inferThirdPlaceRanking,
  computeResolvedTeams,
  PredictionMatch,
  PredictionGroup,
  PredictionTeam,
} from "@/lib/prediction-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = { id: string; name: string; slug: string; sortOrder: number; isKnockout: boolean };

type MatchData = PredictionMatch & {
  group?: { id: string; name: string } | null;
  homePlaceholder?: string | null;
  awayPlaceholder?: string | null;
};

type PredictionData = {
  id: string;
  name: string;
  description?: string | null;
  groupStandings: { groupId: string; teamId: string; position: number }[];
  thirdPlaceRankings: { teamId: string; rank: number }[];
  tieBreakerAnswers: { questionId: string; answer: string }[];
  entries: {
    matchId: string;
    predictedHomeTeamId?: string | null;
    predictedAwayTeamId?: string | null;
    predictedHomeScore?: number | null;
    predictedAwayScore?: number | null;
    match: { phase: { isKnockout: boolean }; homeSourceType?: string; awaySourceType?: string };
  }[];
};

type TieBreakerQuestion = { id: string; prompt: Record<string, string>; type: "NUMBER" | "TEXT"; sortOrder: number };

type ViewData = {
  prediction: PredictionData;
  tournament: { id: string; name: string; groups: PredictionGroup[]; tieBreakers: TieBreakerQuestion[] };
  matches: MatchData[];
};

// ─── Bracket constants ────────────────────────────────────────────────────────

const SLOT_H = 60;
const MATCH_H = 52;
const MATCH_W = 200;
const R_GAP = 28;
const HEADER_H = 30;

function roundX(r: number) {
  return r * (MATCH_W + R_GAP);
}

function matchCenterY(roundIdx: number, matchIdx: number, totalSlots: number): number {
  const slotsPerMatch = totalSlots / (totalSlots / Math.pow(2, roundIdx));
  return (matchIdx + 0.5) * slotsPerMatch * SLOT_H;
}

function matchTopY(roundIdx: number, matchIdx: number, totalSlots: number): number {
  return matchCenterY(roundIdx, matchIdx, totalSlots) - MATCH_H / 2;
}

// ─── Bracket match card ───────────────────────────────────────────────────────

function BracketCard({
  match,
  homeTeam,
  awayTeam,
  winner,
  top,
  left,
  tbd,
}: {
  match: MatchData;
  homeTeam: PredictionTeam | null | undefined;
  awayTeam: PredictionTeam | null | undefined;
  winner: string | undefined;
  top: number;
  left: number;
  tbd: string;
}) {
  const rowH = (MATCH_H - 2) / 2;

  function TeamRow({ team, teamId }: { team: PredictionTeam | null | undefined; teamId: string | null }) {
    const isWinner = !!winner && winner === teamId;
    const isLoser = !!winner && !!teamId && winner !== teamId;
    return (
      <div
        className="flex items-center gap-1.5 px-2"
        style={{
          height: rowH,
          background: isWinner
            ? "linear-gradient(90deg, var(--accent), var(--accent-strong))"
            : "transparent",
          color: isWinner ? "white" : isLoser ? "var(--text-muted)" : undefined,
          opacity: isLoser ? 0.55 : 1,
        }}
      >
        {team ? (
          <>
            <span className="text-sm leading-none shrink-0" aria-hidden>{flagEmoji(team.fifaCode)}</span>
            <span className="text-xs font-semibold truncate">{team.name}</span>
          </>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{tbd}</span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        top: HEADER_H + top,
        left,
        width: MATCH_W,
        height: MATCH_H,
      }}
      className="rounded-[0.7rem] overflow-hidden"
      title={match.label ?? undefined}
    >
      <div
        className="h-full flex flex-col"
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-strong)",
          borderRadius: "0.7rem",
          overflow: "hidden",
        }}
      >
        <TeamRow team={homeTeam} teamId={homeTeam?.id ?? null} />
        <div style={{ height: 2, background: "var(--border)", flexShrink: 0 }} />
        <TeamRow team={awayTeam} teamId={awayTeam?.id ?? null} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PredictionView() {
  const t = useTranslations("predictions");
  const locale = useLocale();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const [data, setData] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/predictions/${id}`)
      .then((r) => {
        if (r.status === 403 || r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((d) => {
        if (d) setData(d);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm muted">{t("view.loading")}</p>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="surface rounded-[2rem] p-8 text-center">
        <p className="text-sm muted">{t("view.notFound")}</p>
        <Link href="/dashboard/predictions" className="mt-4 inline-block rounded-[1.2rem] border px-5 py-3 text-sm font-bold" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>{t("view.backToPredictions")}</Link>
      </div>
    );
  }

  const { prediction, tournament, matches } = data;
  const groups = tournament.groups;

  // Build data maps
  const groupStandings = buildGroupStandingsMap(prediction.groupStandings);
  const knockoutPicks = buildKnockoutPicksMap(prediction.entries);
  // Use persisted ranking when available; fall back to inferring for old predictions
  const thirdPlaceRanking =
    prediction.thirdPlaceRankings.length > 0
      ? prediction.thirdPlaceRankings.map((r) => r.teamId)
      : inferThirdPlaceRanking(groups, groupStandings, prediction.entries);
  const resolvedTeams = computeResolvedTeams(matches, groups, groupStandings, thirdPlaceRanking, knockoutPicks);

  const teamById = new Map<string, PredictionTeam>();
  for (const g of groups) {
    for (const { team } of g.teams) teamById.set(team.id, team);
  }

  // Knockout phases sorted
  const knockoutPhases = matches
    .map((m) => m.phase)
    .filter((p, i, arr) => p.isKnockout && arr.findIndex((x) => x.id === p.id) === i)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const matchesByPhase: Record<string, MatchData[]> = {};
  for (const m of matches) {
    if (!m.phase.isKnockout) continue;
    if (!matchesByPhase[m.phase.id]) matchesByPhase[m.phase.id] = [];
    matchesByPhase[m.phase.id].push(m);
  }
  for (const key of Object.keys(matchesByPhase)) {
    matchesByPhase[key].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Find champion (winner of Final)
  const finalPhase = knockoutPhases[knockoutPhases.length - 1];
  const finalMatch = finalPhase ? (matchesByPhase[finalPhase.id] ?? [])[0] : null;
  const championId = finalMatch ? knockoutPicks[finalMatch.id] : undefined;
  const champion = championId ? teamById.get(championId) : undefined;

  // Third-place groups
  const teamToGroupName = new Map<string, string>();
  for (const g of groups) {
    for (const { team } of g.teams) teamToGroupName.set(team.id, g.name);
  }

  // ── Bracket SVG data ─────────────────────────────────────────────────────
  const totalSlots = knockoutPhases.length > 0 ? (matchesByPhase[knockoutPhases[0].id]?.length ?? 16) : 16;
  const bracketH = totalSlots * SLOT_H;
  const bracketW = knockoutPhases.length * (MATCH_W + R_GAP) - R_GAP;

  // Connector SVG paths
  const connectorPaths: string[] = [];
  for (let r = 0; r < knockoutPhases.length - 1; r++) {
    const roundMatches = matchesByPhase[knockoutPhases[r].id] ?? [];
    for (let k = 0; k < Math.floor(roundMatches.length / 2); k++) {
      const topY = matchCenterY(r, 2 * k, totalSlots);
      const botY = matchCenterY(r, 2 * k + 1, totalSlots);
      const nextY = matchCenterY(r + 1, k, totalSlots);
      const x1 = roundX(r) + MATCH_W;
      const x2 = roundX(r + 1);
      const xMid = x1 + (x2 - x1) * 0.45;
      connectorPaths.push(`M ${x1} ${topY} H ${xMid} V ${botY} M ${x1} ${botY} H ${xMid}`);
      connectorPaths.push(`M ${xMid} ${nextY} H ${x2}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section
        className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>
              {t("tagline")}
            </p>
            <h2 className="display-title mt-2 text-4xl font-extrabold leading-tight md:text-5xl">
              {prediction.name}
            </h2>
            <p className="mt-1 text-sm muted">{tournament.name}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {champion && (
              <div
                className="flex items-center gap-2 rounded-[1.4rem] px-4 py-3 text-sm font-extrabold text-white"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
              >
                <span className="text-xl leading-none" aria-hidden>{flagEmoji(champion.fifaCode)}</span>
                <span>{t("view.champion")}: {champion.name}</span>
              </div>
            )}
            <Link
              href="/dashboard/predictions"
              className="surface rounded-[1.4rem] px-5 py-3 text-sm font-bold uppercase tracking-[0.2em]"
            >
              {t("view.backToPredictions")}
            </Link>
          </div>
        </div>
      </section>

      {/* Group standings */}
      <section className="surface rounded-[2rem] p-5 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] muted mb-5">{t("view.groupStandings")}</p>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {groups.map((group) => {
            const standings = groupStandings[group.id] ?? [];
            return (
              <div key={group.id} className="rounded-[1.4rem] border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <div
                  className="flex items-center gap-2 px-3 py-2"
                  style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                >
                  <span className="text-sm font-extrabold text-white">{group.name}</span>
                </div>
                <div style={{ background: "var(--bg-strong)" }}>
                  {standings.map((teamId, i) => {
                    const team = teamById.get(teamId);
                    const isAdvancing = i < 2;
                    const isThird = i === 2;
                    return (
                      <div
                        key={teamId ?? i}
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                        style={{
                          borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                          background: isAdvancing ? "color-mix(in srgb, var(--accent-soft) 60%, transparent)" : undefined,
                        }}
                      >
                        <span
                          className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-extrabold"
                          style={{
                            background: isAdvancing ? "var(--accent)" : isThird ? "color-mix(in srgb, var(--accent) 45%, transparent)" : "var(--border)",
                            color: isAdvancing ? "white" : isThird ? "var(--accent-strong)" : "var(--text-muted)",
                          }}
                        >
                          {i + 1}
                        </span>
                        {team && <span className="text-base leading-none" aria-hidden>{flagEmoji(team.fifaCode)}</span>}
                        <span className="font-semibold truncate">{team?.name ?? "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Third-place qualifiers */}
      <section className="surface rounded-[2rem] p-5 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] muted mb-5">{t("view.thirdPlaceQualifiers")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {thirdPlaceRanking.map((teamId, i) => {
                const team = teamById.get(teamId);
                const groupName = teamToGroupName.get(teamId);
                const isQualified = i < 8;
                const showDivider = i === 8;
                return (
                  <tr
                    key={teamId}
                    style={{
                      borderTop: showDivider ? "2px solid var(--border)" : i > 0 ? "1px solid var(--border)" : undefined,
                    }}
                  >
                    <td className="py-2 pr-3 text-right font-mono text-xs muted w-8">{i + 1}</td>
                    <td className="py-2 pr-2 text-base leading-none w-8" aria-hidden>
                      {team ? flagEmoji(team.fifaCode) : ""}
                    </td>
                    <td className="py-2 font-semibold">{team?.name ?? teamId}</td>
                    <td className="py-2 px-3 text-xs muted">{groupName ? `Group ${groupName}` : ""}</td>
                    <td className="py-2 pl-3 text-right">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.15em]"
                        style={{
                          background: isQualified ? "var(--accent-soft)" : "var(--bg-muted)",
                          color: isQualified ? "var(--accent-strong)" : "var(--text-muted)",
                        }}
                      >
                        {isQualified ? t("view.qualified") : t("view.eliminated")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Knockout bracket */}
      {knockoutPhases.length > 0 && (
        <section className="surface rounded-[2rem] p-5 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted mb-5">{t("view.knockoutBracket")}</p>
          <div className="overflow-x-auto">
            <div
              style={{
                position: "relative",
                width: bracketW,
                height: HEADER_H + bracketH,
                minWidth: bracketW,
              }}
            >
              {/* Round headers */}
              {knockoutPhases.map((phase, r) => (
                <div
                  key={phase.id}
                  style={{
                    position: "absolute",
                    left: roundX(r),
                    top: 0,
                    width: MATCH_W,
                    height: HEADER_H,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] muted">{phase.name}</span>
                </div>
              ))}

              {/* SVG connector lines */}
              <svg
                style={{
                  position: "absolute",
                  top: HEADER_H,
                  left: 0,
                  width: bracketW,
                  height: bracketH,
                  overflow: "visible",
                  pointerEvents: "none",
                }}
              >
                {connectorPaths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                ))}
              </svg>

              {/* Match cards */}
              {knockoutPhases.map((phase, r) => {
                const phaseMatches = matchesByPhase[phase.id] ?? [];
                return phaseMatches.map((match, i) => {
                  const resolved = resolvedTeams[match.id];
                  const homeId = resolved?.home ?? null;
                  const awayId = resolved?.away ?? null;
                  const homeTeam = homeId ? teamById.get(homeId) : undefined;
                  const awayTeam = awayId ? teamById.get(awayId) : undefined;
                  const winner = knockoutPicks[match.id];
                  return (
                    <BracketCard
                      key={match.id}
                      match={match}
                      homeTeam={homeTeam}
                      awayTeam={awayTeam}
                      winner={winner}
                      top={matchTopY(r, i, totalSlots)}
                      left={roundX(r)}
                      tbd={t("view.tbd")}
                    />
                  );
                });
              })}
            </div>
          </div>
        </section>
      )}

      {/* Tie-breaker answers */}
      {tournament.tieBreakers.length > 0 && (
        <section className="surface rounded-[2rem] p-5 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted mb-5">{t("view.tieBreakers")}</p>
          <div className="space-y-0">
            {tournament.tieBreakers.map((q, i) => {
              const answer = prediction.tieBreakerAnswers.find((a) => a.questionId === q.id)?.answer;
              return (
                <div
                  key={q.id}
                  className="flex items-center justify-between gap-4 py-3"
                  style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
                >
                  <span className="text-sm">{q.prompt[locale] ?? q.prompt["en"] ?? Object.values(q.prompt)[0] ?? ""}</span>
                  <span
                    className="shrink-0 rounded-full px-3 py-1 text-sm font-bold"
                    style={{
                      background: answer ? "var(--accent-soft)" : "var(--bg-muted)",
                      color: answer ? "var(--accent-strong)" : "var(--text-muted)",
                    }}
                  >
                    {answer ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
