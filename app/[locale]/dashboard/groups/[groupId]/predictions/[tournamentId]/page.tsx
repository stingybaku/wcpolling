"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import { flagEmoji } from "@/lib/fifa-flags";

// ─── Types ────────────────────────────────────────────────────────────────────

type StageStatus = "UPCOMING" | "OPEN" | "CLOSED" | "SCORED";
type StageType = "GROUP_QUALIFICATION" | "KNOCKOUT";

type Stage = {
  id: string;
  name: string;
  type: StageType;
  status: StageStatus;
  order: number;
  roundLabel: string | null;
  opensAt: string;
  closesAt: string;
  qualificationResult: { id: string; qualifiers: unknown } | null;
  _count: { stageMatches: number };
};

type StagePrediction = {
  qualificationPicks: string[] | null;
  matchPicks: { matchId: string; winnerId: string }[] | null;
  submittedAt: string | null;
} | null;

type Team = {
  id: string;
  name: string;
  fifaCode: string;
  groupMemberships: { group: { id: string; name: string } }[];
};

type StageMatch = {
  id: string;
  matchNumber: number;
  homeTeam: Team | null;
  awayTeam: Team | null;
  winnerId: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Countdown({ closesAt }: { closesAt: string }) {
  const t = useTranslations("stagedPredictions");
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(closesAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining(t("closed")); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [closesAt, t]);

  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: "var(--gold)" }}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {t("closesIn", { remaining })}
    </span>
  );
}

// ─── GROUP_QUALIFICATION Form ─────────────────────────────────────────────────

function GroupQualificationForm({
  stage,
  groupId,
  teams,
  existing,
  onSaved,
}: {
  stage: Stage;
  groupId: string;
  teams: Team[];
  existing: StagePrediction;
  onSaved: (pred: StagePrediction) => void;
}) {
  const t = useTranslations("stagedPredictions");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(existing?.qualificationPicks ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      if (!prev.has(id) && prev.size >= 32) return prev; // cap at 32
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save(submit: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/staged/groups/${groupId}/stages/${stage.id}/prediction`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualificationPicks: [...selected], submit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      onSaved(data.prediction);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("errorSaving"));
    } finally {
      setSaving(false);
    }
  }

  // Group teams by their FIFA group name (A–L). Teams with no group go to "Other".
  const groupedTeams = teams.reduce<Record<string, Team[]>>((acc, team) => {
    const groupName = team.groupMemberships?.[0]?.group?.name ?? "Other";
    (acc[groupName] ??= []).push(team);
    return acc;
  }, {});
  const groupNames = Object.keys(groupedTeams).sort();
  const isFull = selected.size >= 32;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm muted">
          {t("pick32Title", { count: 32 })}
          {" "}
          {t("pick32Desc")}
        </p>
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: isFull ? "var(--accent)" : "var(--muted)" }}
        >
          {t("selectedCount", { selected: selected.size, total: 32 })}
        </span>
      </div>

      {isFull && (
        <p
          className="text-xs rounded-lg px-3 py-2"
          style={{
            color: "var(--gold)",
            background: "var(--gold-soft)",
            border: "1px solid var(--gold)",
          }}
        >
          {t("fullMessage", { total: 32 })}
        </p>
      )}

      <div className="space-y-4">
        {groupNames.map((groupName) => {
          const groupTeams = groupedTeams[groupName];
          const selectedInGroup = groupTeams.filter((tm) => selected.has(tm.id)).length;
          return (
            <div key={groupName}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider muted-2">
                  {t("groupLabel", { name: groupName })}
                </span>
                <span
                  className="text-xs font-semibold tabular-nums"
                  style={{
                    color:
                      selectedInGroup >= 3
                        ? "var(--accent)"
                        : selectedInGroup === 2
                          ? "var(--muted)"
                          : "var(--muted-2)",
                  }}
                >
                  {t("groupCount", { selected: selectedInGroup, max: 3 })}
                </span>
                {selectedInGroup >= 3 && (
                  <span className="text-xs" style={{ color: "var(--accent)" }}>{t("groupFull")}</span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {groupTeams.map((team) => {
                  const isSelected = selected.has(team.id);
                  const isDisabled = !isSelected && (isFull || selectedInGroup >= 3);
                  return (
                    <button
                      key={team.id}
                      onClick={() => toggle(team.id)}
                      disabled={isDisabled}
                      className="relative flex items-center gap-2 p-2 rounded-lg border-2 text-xs font-medium transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
                      style={
                        isSelected
                          ? {
                              background: "var(--accent-soft)",
                              borderColor: "var(--accent)",
                              color: "var(--accent-ink)",
                            }
                          : {
                              background: "var(--paper)",
                              borderColor: "var(--border)",
                              color: "var(--ink)",
                            }
                      }
                    >
                      {isSelected && (
                        <span className="absolute top-1 right-1" style={{ color: "var(--accent)" }}>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                      <span className="text-lg leading-none">{flagEmoji(team.fifaCode)}</span>
                      <span className="leading-tight">{team.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm" style={{ color: "var(--live)" }}>{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => save(false)}
          disabled={saving || selected.size === 0}
          className="btn btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("saving") : t("saveDraft")}
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving || selected.size !== 32}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("submitting") : t("submitPicks")}
        </button>
      </div>
    </div>
  );
}

// ─── KNOCKOUT Form ────────────────────────────────────────────────────────────

function KnockoutForm({
  stage,
  groupId,
  matches,
  existing,
  onSaved,
}: {
  stage: Stage;
  groupId: string;
  matches: StageMatch[];
  existing: StagePrediction;
  onSaved: (pred: StagePrediction) => void;
}) {
  const t = useTranslations("stagedPredictions");
  const [picks, setPicks] = useState<Record<string, string>>(
    () => Object.fromEntries((existing?.matchPicks ?? []).map((p) => [p.matchId, p.winnerId]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(matchId: string, winnerId: string) {
    setPicks((prev) => ({ ...prev, [matchId]: winnerId }));
  }

  async function save(submit: boolean) {
    setSaving(true);
    setError(null);
    try {
      const matchPicks = Object.entries(picks).map(([matchId, winnerId]) => ({ matchId, winnerId }));
      const res = await fetch(`/api/staged/groups/${groupId}/stages/${stage.id}/prediction`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchPicks, submit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      onSaved(data.prediction);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("errorSaving"));
    } finally {
      setSaving(false);
    }
  }

  const pickedCount = Object.keys(picks).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm muted">{t("pickWinners")}</p>
        <span
          className="text-sm font-semibold"
          style={{ color: pickedCount === matches.length ? "var(--accent)" : "var(--muted)" }}
        >
          {t("matchesPickedCount", { picked: pickedCount, total: matches.length })}
        </span>
      </div>

      <div className="space-y-3">
        {matches.map((match) => {
          const winner = picks[match.id];
          return (
            <div
              key={match.id}
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ border: "1px solid var(--border)", background: "var(--paper)" }}
            >
              <span className="text-xs w-6 text-center font-medium muted-2">{match.matchNumber}</span>
              {[match.homeTeam, match.awayTeam].map((team) => {
                if (!team) return null;
                const isWinner = winner === team.id;
                return (
                  <button
                    key={team.id}
                    onClick={() => pick(match.id, team.id)}
                    className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all"
                    style={
                      isWinner
                        ? {
                            background: "var(--accent-soft)",
                            borderColor: "var(--accent)",
                            color: "var(--accent-ink)",
                          }
                        : {
                            background: "var(--paper-strong)",
                            borderColor: "var(--border)",
                            color: "var(--ink)",
                          }
                    }
                  >
                    <span className="text-lg">{flagEmoji(team.fifaCode)}</span>
                    <span>{team.name}</span>
                    {isWinner && (
                      <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20" style={{ color: "var(--accent)" }}>
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm" style={{ color: "var(--live)" }}>{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving || pickedCount === 0}
          className="btn btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("saving") : t("saveDraft")}
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving || pickedCount !== matches.length}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("submitting") : t("submitPicks")}
        </button>
      </div>
    </div>
  );
}

// ─── Read-only picks display ──────────────────────────────────────────────────

function ReadOnlyPicks({
  stage,
  prediction,
  teams,
  matches,
}: {
  stage: Stage;
  prediction: StagePrediction;
  teams: Team[];
  matches: StageMatch[];
}) {
  const t = useTranslations("stagedPredictions");

  if (!prediction) return <p className="text-sm italic muted">{t("noPicks")}</p>;

  if (stage.type === "GROUP_QUALIFICATION" && prediction.qualificationPicks) {
    const teamMap = Object.fromEntries(teams.map((tm) => [tm.id, tm]));
    const qualifierSet = stage.status === "SCORED" && Array.isArray(stage.qualificationResult?.qualifiers)
      ? new Set(stage.qualificationResult.qualifiers as string[])
      : null;
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {prediction.qualificationPicks.map((id) => {
          const team = teamMap[id];
          if (!team) return null;
          const correct = qualifierSet ? qualifierSet.has(id) : null;
          return (
            <div
              key={id}
              className="relative flex flex-col items-center gap-1 p-2 rounded-lg text-xs font-medium"
              style={
                correct === true
                  ? {
                      background: "color-mix(in srgb, #22c55e 12%, transparent)",
                      border: "1px solid #86efac",
                      color: "var(--ink)",
                    }
                  : correct === false
                    ? {
                        background: "color-mix(in srgb, #ef4444 10%, transparent)",
                        border: "1px solid #fca5a5",
                        color: "var(--ink)",
                      }
                    : {
                        background: "color-mix(in srgb, #22c55e 12%, transparent)",
                        border: "1px solid #86efac",
                        color: "var(--ink)",
                      }
              }
            >
              {correct !== null && (
                <span
                  className="absolute top-1 right-1 text-[10px] font-bold"
                  style={{ color: correct ? "#22c55e" : "var(--live)" }}
                >
                  {correct ? "✓" : "✗"}
                </span>
              )}
              <span className="text-xl">{flagEmoji(team.fifaCode)}</span>
              <span className="text-center">{team.name}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (stage.type === "KNOCKOUT" && prediction.matchPicks) {
    // Build team map from match data directly (matches include homeTeam/awayTeam)
    const teamMap: Record<string, Team> = {};
    for (const m of matches) {
      if (m.homeTeam) teamMap[m.homeTeam.id] = m.homeTeam;
      if (m.awayTeam) teamMap[m.awayTeam.id] = m.awayTeam;
    }
    const matchMap = Object.fromEntries(matches.map((m) => [m.id, m]));
    const actualResult = stage.status === "SCORED"
      ? Object.fromEntries(matches.filter(m => m.winnerId).map(m => [m.id, m.winnerId!]))
      : null;
    return (
      <div className="space-y-2">
        {prediction.matchPicks.map((p) => {
          const match = matchMap[p.matchId];
          const winner = teamMap[p.winnerId];
          if (!match || !winner) return null;
          const correct = actualResult ? actualResult[p.matchId] === p.winnerId : null;
          return (
            <div
              key={p.matchId}
              className="flex items-center gap-2 text-sm rounded-lg px-2 py-1"
              style={
                correct === true
                  ? { background: "color-mix(in srgb, #22c55e 12%, transparent)" }
                  : correct === false
                    ? { background: "color-mix(in srgb, #ef4444 10%, transparent)" }
                    : {}
              }
            >
              <span className="w-6 text-center shrink-0 muted-2">{match.matchNumber}</span>
              <span className="text-lg">{flagEmoji(winner.fifaCode)}</span>
              <span className="font-medium flex-1" style={{ color: "var(--ink)" }}>{winner.name}</span>
              {correct === true && <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>✓</span>}
              {correct === false && <span className="text-xs font-semibold" style={{ color: "var(--live)" }}>✗</span>}
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}

// ─── Stage Card ───────────────────────────────────────────────────────────────

function StageCard({
  stage,
  prediction,
  groupId,
  teams,
  matches,
  defaultOpen,
  onPredictionUpdate,
}: {
  stage: Stage;
  prediction: StagePrediction;
  groupId: string;
  teams: Team[];
  matches: StageMatch[];
  defaultOpen: boolean;
  onPredictionUpdate: (stageId: string, pred: StagePrediction) => void;
}) {
  const t = useTranslations("stagedPredictions");
  const [open, setOpen] = useState(defaultOpen);

  const statusStyles: Record<StageStatus, { background: string; color: string }> = {
    UPCOMING: { background: "var(--paper-strong)", color: "var(--muted)" },
    OPEN: { background: "var(--accent-soft)", color: "var(--accent-ink)" },
    CLOSED: { background: "var(--gold-soft)", color: "var(--gold)" },
    SCORED: { background: "color-mix(in srgb, #6366f1 15%, transparent)", color: "#818cf8" },
  };

  const isSubmitted = !!prediction?.submittedAt;

  return (
    <div
      className={`rounded-xl overflow-hidden transition-opacity ${stage.status === "UPCOMING" ? "opacity-60" : ""}`}
      style={{ background: "var(--paper)", border: "1px solid var(--border)" }}
    >
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
        disabled={stage.status === "UPCOMING"}
      >
        <div className="flex items-center gap-3">
          {stage.status === "UPCOMING" && (
            <svg className="w-4 h-4 muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v3m0-3h3m-3 0h-3m0-6V4m0 0V1m0 3h3m-3 0H9" />
            </svg>
          )}
          <div>
            <p className="font-semibold" style={{ color: "var(--ink)" }}>{stage.name}</p>
            {stage.roundLabel && <p className="text-xs muted">{stage.roundLabel}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stage.status === "UPCOMING" && (
            <span className="text-xs muted">{t("opensAt", { date: formatDate(stage.opensAt) })}</span>
          )}
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={statusStyles[stage.status]}
          >
            {stage.status === "SCORED" ? t("statusScored") : stage.status === "CLOSED" ? t("statusClosed") : stage.status === "OPEN" ? t("statusOpen") : t("statusUpcoming")}
          </span>
          {stage.status !== "UPCOMING" && (
            <svg
              className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: "var(--muted)" }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {open && stage.status !== "UPCOMING" && (
        <div
          className="px-5 pb-5 pt-4 space-y-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {stage.status === "OPEN" && (
            <div className="flex items-center justify-between">
              <Countdown closesAt={stage.closesAt} />
              {isSubmitted && (
                <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                  {t("submittedAt", { date: formatDate(prediction!.submittedAt!) })}
                </span>
              )}
            </div>
          )}

          {stage.status === "OPEN" && isSubmitted && (
            <div className="space-y-3">
              <div
                className="p-3 rounded-lg text-sm flex items-center gap-2"
                style={{
                  background: "var(--accent-soft)",
                  border: "1px solid var(--accent)",
                  color: "var(--accent-ink)",
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t("lockedIn")}
              </div>
              <ReadOnlyPicks stage={stage} prediction={prediction} teams={teams} matches={matches} />
            </div>
          )}

          {stage.status === "OPEN" && !isSubmitted && stage.type === "GROUP_QUALIFICATION" && teams.length > 0 && (
            <GroupQualificationForm
              stage={stage}
              groupId={groupId}
              teams={teams}
              existing={prediction}
              onSaved={(pred) => onPredictionUpdate(stage.id, pred)}
            />
          )}

          {stage.status === "OPEN" && !isSubmitted && stage.type === "KNOCKOUT" && matches.length > 0 && (
            <KnockoutForm
              stage={stage}
              groupId={groupId}
              matches={matches}
              existing={prediction}
              onSaved={(pred) => onPredictionUpdate(stage.id, pred)}
            />
          )}

          {(stage.status === "CLOSED" || stage.status === "SCORED") && (
            <ReadOnlyPicks stage={stage} prediction={prediction} teams={teams} matches={matches} />
          )}

          {stage.status === "SCORED" && (
            <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs font-medium uppercase tracking-wide mb-1 muted">{t("pointsEarned")}</p>
              <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>–</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const { groupId, tournamentId } = useParams<{ groupId: string; tournamentId: string }>();
  const t = useTranslations("stagedPredictions");

  const [stages, setStages] = useState<Stage[]>([]);
  const [predictions, setPredictions] = useState<Record<string, StagePrediction>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [matchesByStage, setMatchesByStage] = useState<Record<string, StageMatch[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || !tournamentId) return;

    async function load() {
      setLoading(true);
      try {
        const stagesRes = await fetch(`/api/staged/tournaments/${tournamentId}/stages`);
        const stagesData = await stagesRes.json();
        const fetchedStages: Stage[] = stagesData.stages ?? [];
        setStages(fetchedStages);

        const predEntries = await Promise.all(
          fetchedStages.map(async (s) => {
            const res = await fetch(`/api/staged/groups/${groupId}/stages/${s.id}/prediction`);
            const data = await res.json();
            return [s.id, data.prediction ?? null] as [string, StagePrediction];
          })
        );
        setPredictions(Object.fromEntries(predEntries));

        const gqOpen = fetchedStages.find((s) => s.type === "GROUP_QUALIFICATION" && s.status !== "UPCOMING");
        if (gqOpen) {
          const teamsRes = await fetch("/api/admin/teams");
          const teamsData = await teamsRes.json();
          setTeams(teamsData.teams ?? []);
        }

        const knockoutActive = fetchedStages.filter((s) => s.type === "KNOCKOUT" && s.status !== "UPCOMING");
        if (knockoutActive.length > 0) {
          const matchEntries = await Promise.all(
            knockoutActive.map(async (s) => {
              const res = await fetch(`/api/admin/staged/stages/${s.id}/matches`);
              const data = await res.json();
              return [s.id, data.matches ?? []] as [string, StageMatch[]];
            })
          );
          setMatchesByStage(Object.fromEntries(matchEntries));
        }

      } finally {
        setLoading(false);
      }
    }

    load();
  }, [groupId, tournamentId]);

  function handlePredictionUpdate(stageId: string, pred: StagePrediction) {
    setPredictions((prev) => ({ ...prev, [stageId]: pred }));
  }

  const openStageIndex = stages.findIndex((s) => s.status === "OPEN");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/dashboard/groups/${groupId}`}
            className="text-sm flex items-center gap-1"
            style={{ color: "var(--accent)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("backToGroup")}
          </Link>
          <h1 className="text-2xl font-bold mt-3" style={{ color: "var(--ink)" }}>{t("pageTitle")}</h1>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-xl animate-pulse"
                style={{ background: "var(--paper)", border: "1px solid var(--border)" }}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {stages.map((stage, i) => (
              <StageCard
                key={stage.id}
                stage={stage}
                prediction={predictions[stage.id] ?? null}
                groupId={groupId}
                teams={teams}
                matches={matchesByStage[stage.id] ?? []}
                defaultOpen={i === openStageIndex}
                onPredictionUpdate={handlePredictionUpdate}
              />
            ))}
            {stages.length === 0 && (
              <div className="text-center py-16 muted">
                <p className="font-medium">{t("noStages")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
