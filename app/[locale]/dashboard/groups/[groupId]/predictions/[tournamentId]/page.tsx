"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/lib/navigation";
import { TeamFlag } from "@/components/team-flag";

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
  lockedOutMatchIds: string[] | null;
  submittedAt: string | null;
  unlockedAt: string | null;
} | null;

type StageScore = { points: number; correctPicks: number } | null;

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
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const parts = [];
      if (d > 0) parts.push(`${d}d`);
      if (d > 0 || h > 0) parts.push(`${h}h`);
      parts.push(`${m}m`);
      setRemaining(parts.join(" "));
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [closesAt, t]);

  return (
    <span className="inline-flex flex-col gap-0.5 text-sm font-medium" style={{ color: "var(--gold)" }}>
      <span className="inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t("closesIn", { remaining })}
      </span>
      <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
        {t("closesOn", { date: formatDate(closesAt) })}
      </span>
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
  const wasUnlocked = !!existing?.unlockedAt;
  const [confirming, setConfirming] = useState(false);

  function onSubmitClick() {
    if (wasUnlocked && !confirming) { setConfirming(true); return; }
    void save(true);
  }

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
                      <TeamFlag code={team.fifaCode} size={20} />
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
      {confirming && (
        <p className="text-xs rounded-lg px-3 py-2" style={{ color: "var(--gold)", background: "var(--gold-soft)", border: "1px solid var(--gold)" }}>
          {t("confirmResubmit")}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => save(false)}
          disabled={saving || selected.size === 0}
          className="btn btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("saving") : t("saveDraft")}
        </button>
        {confirming && (
          <button onClick={() => setConfirming(false)} disabled={saving} className="btn btn-ghost">
            {t("cancel")}
          </button>
        )}
        <button
          onClick={onSubmitClick}
          disabled={saving || selected.size !== 32}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("submitting") : confirming ? t("confirmResubmitYes") : t("submitPicks")}
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
  const wasUnlocked = !!existing?.unlockedAt;
  const [confirming, setConfirming] = useState(false);

  function onSubmitClick() {
    if (wasUnlocked && !confirming) { setConfirming(true); return; }
    void save(true);
  }

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
                    <TeamFlag code={team.fifaCode} size={20} />
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
      {confirming && (
        <p className="text-xs rounded-lg px-3 py-2" style={{ color: "var(--gold)", background: "var(--gold-soft)", border: "1px solid var(--gold)" }}>
          {t("confirmResubmit")}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving || pickedCount === 0}
          className="btn btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("saving") : t("saveDraft")}
        </button>
        {confirming && (
          <button onClick={() => setConfirming(false)} disabled={saving} className="btn btn-ghost">
            {t("cancel")}
          </button>
        )}
        <button
          onClick={onSubmitClick}
          disabled={saving || pickedCount !== matches.length}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("submitting") : confirming ? t("confirmResubmitYes") : t("submitPicks")}
        </button>
      </div>
    </div>
  );
}

// ─── Picks comparison (live vs. actual results) ───────────────────────────────

type PickState = "correct" | "missed" | "pending" | "excluded";

const STATE_STYLE: Record<PickState, { background: string; border: string }> = {
  correct: { background: "color-mix(in srgb, #22c55e 12%, transparent)", border: "1px solid #86efac" },
  missed: { background: "color-mix(in srgb, #ef4444 10%, transparent)", border: "1px solid #fca5a5" },
  pending: { background: "var(--paper-strong)", border: "1px solid var(--border)" },
  excluded: { background: "var(--paper-strong)", border: "1px dashed var(--border)" },
};

const STATE_MARK: Record<PickState, { glyph: string; color: string } | null> = {
  correct: { glyph: "✓", color: "#22c55e" },
  missed: { glyph: "✗", color: "var(--live)" },
  pending: { glyph: "⏳", color: "var(--muted)" },
  excluded: null,
};

type ComparisonStats = { total: number; decided: number; correct: number; missed: number; pending: number };

function summarize(states: PickState[]): ComparisonStats {
  const counted = states.filter((s) => s !== "excluded");
  const correct = counted.filter((s) => s === "correct").length;
  const missed = counted.filter((s) => s === "missed").length;
  const pending = counted.filter((s) => s === "pending").length;
  return { total: counted.length, decided: correct + missed, correct, missed, pending };
}

function StageResultSummary({ stats, score, isFinal }: { stats: ComparisonStats; score: StageScore; isFinal: boolean }) {
  const t = useTranslations("stagedPredictions");
  const points = score?.points ?? 0;
  const pct = stats.total > 0 ? Math.round((stats.decided / stats.total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="font-semibold tabular-nums" style={{ color: "#22c55e" }}>
            {t("correctSoFar", { correct: stats.correct })}
          </span>
          {stats.missed > 0 && (
            <span className="tabular-nums" style={{ color: "var(--live)" }}>{t("missedCount", { missed: stats.missed })}</span>
          )}
          {stats.pending > 0 && (
            <span className="tabular-nums muted">{t("pendingCount", { pending: stats.pending })}</span>
          )}
          <span className="font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
            {t("pointsSoFar", { points })}
          </span>
        </div>
        {!isFinal && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: "color-mix(in srgb, #ef4444 12%, transparent)", color: "var(--live)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--live)" }} />
            {t("liveBadge")}
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--paper-strong)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
      </div>
      {!isFinal && <p className="text-xs muted">{t("resultsProvisional")}</p>}
    </div>
  );
}

function ReadOnlyPicks({
  stage,
  prediction,
  score,
  teams,
  matches,
}: {
  stage: Stage;
  prediction: StagePrediction;
  score: StageScore;
  teams: Team[];
  matches: StageMatch[];
}) {
  const t = useTranslations("stagedPredictions");

  if (!prediction) return <p className="text-sm italic muted">{t("noPicks")}</p>;

  const isFinal = stage.status === "SCORED";

  if (stage.type === "GROUP_QUALIFICATION" && prediction.qualificationPicks) {
    const teamMap = Object.fromEntries(teams.map((tm) => [tm.id, tm]));
    const qualifierSet = Array.isArray(stage.qualificationResult?.qualifiers)
      ? new Set(stage.qualificationResult.qualifiers as string[])
      : null;
    // Qualifiers are computed live against the current standings (so points keep
    // updating in the background), but we only reveal correct/incorrect once the
    // stage is officially SCORED. Until then every pick shows as pending to avoid
    // implying a final result while the group stage is still in progress.
    const revealResults = isFinal && qualifierSet !== null;

    const rows = prediction.qualificationPicks.map((id) => ({
      id,
      team: teamMap[id],
      state: (!revealResults ? "pending" : qualifierSet!.has(id) ? "correct" : "missed") as PickState,
    }));
    const stats = summarize(rows.map((r) => r.state));

    return (
      <div className="space-y-4">
        {revealResults
          ? <StageResultSummary stats={stats} score={score} isFinal={isFinal} />
          : <p className="text-sm muted">{t("groupStagePending")}</p>}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {rows.map(({ id, team, state }) => {
            if (!team) return null;
            const mark = STATE_MARK[state];
            return (
              <div
                key={id}
                className="relative flex flex-col items-center gap-1 p-2 rounded-lg text-xs font-medium"
                style={{ ...STATE_STYLE[state], color: "var(--ink)" }}
              >
                {mark && (
                  <span className="absolute top-1 right-1 text-[10px] font-bold" style={{ color: mark.color }}>
                    {mark.glyph}
                  </span>
                )}
                <TeamFlag code={team.fifaCode} size={24} />
                <span className="text-center">{team.name}</span>
              </div>
            );
          })}
        </div>
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
    const lockedOut = new Set(prediction.lockedOutMatchIds ?? []);
    const hasResults = matches.some((m) => m.winnerId);

    const rows = prediction.matchPicks.map((p) => {
      const match = matchMap[p.matchId];
      const picked = teamMap[p.winnerId];
      const actualWinner = match?.winnerId ? teamMap[match.winnerId] : null;
      let state: PickState;
      if (lockedOut.has(p.matchId)) state = "excluded";
      else if (match?.winnerId) state = match.winnerId === p.winnerId ? "correct" : "missed";
      else state = "pending";
      return { pick: p, match, picked, actualWinner, state };
    });
    const stats = summarize(rows.map((r) => r.state));

    return (
      <div className="space-y-4">
        {hasResults
          ? <StageResultSummary stats={stats} score={score} isFinal={isFinal} />
          : <p className="text-sm muted">{t("resultsNotStarted")}</p>}
        <div className="space-y-2">
          {rows.map(({ pick, match, picked, actualWinner, state }) => {
            if (!match || !picked) return null;
            const mark = STATE_MARK[state];
            return (
              <div
                key={pick.matchId}
                className="flex items-center gap-2 text-sm rounded-lg px-3 py-2"
                style={STATE_STYLE[state]}
              >
                <span className="w-6 text-center shrink-0 muted-2">{match.matchNumber}</span>
                <span className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[10px] uppercase tracking-wide muted-2">{t("yourPick")}</span>
                  <TeamFlag code={picked.fifaCode} size={20} />
                  <span className="font-medium truncate" style={{ color: "var(--ink)" }}>{picked.name}</span>
                </span>
                <span className="shrink-0 text-right">
                  {state === "excluded" ? (
                    <span className="text-xs italic muted">{t("excludedPick")}</span>
                  ) : actualWinner ? (
                    <span className="inline-flex items-center gap-1">
                      <TeamFlag code={actualWinner.fifaCode} size={20} />
                      <span className="text-xs muted">{t("won")}</span>
                      {mark && <span className="text-xs font-semibold" style={{ color: mark.color }}>{mark.glyph}</span>}
                    </span>
                  ) : (
                    <span className="text-xs italic muted">{t("waitingResult")}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Tie Breaker Section ──────────────────────────────────────────────────────

type TieBreakerQuestion = {
  id: string;
  prompt: Record<string, string>;
  type: "NUMBER" | "TEXT";
  sortOrder: number;
};

type TieBreakerAnswer = {
  questionId: string;
  answer: string;
};

function TieBreakerSection({ groupId }: { groupId: string }) {
  const t = useTranslations("stagedPredictions");
  const locale = useLocale();

  const [questions, setQuestions] = useState<TieBreakerQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<"ok" | "error" | null>(null);

  useEffect(() => {
    fetch(`/api/staged/groups/${groupId}/tiebreakers`)
      .then((r) => r.json())
      .then((data) => {
        setQuestions(data.questions ?? []);
        const answerMap: Record<string, string> = {};
        for (const a of (data.answers ?? []) as TieBreakerAnswer[]) {
          answerMap[a.questionId] = a.answer;
        }
        setAnswers(answerMap);
        setClosedAt(data.closedAt ?? null);
      })
      .catch(() => {});
  }, [groupId]);

  if (questions.length === 0) return null;

  const isClosed = closedAt != null;

  async function handleSave() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const payload = questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" }));
      const res = await fetch(`/api/staged/groups/${groupId}/tiebreakers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      if (!res.ok) throw new Error();
      setSavedMsg("ok");
    } catch {
      setSavedMsg("error");
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMsg(null), 3000);
    }
  }

  return (
    <div
      className="rounded-xl p-5 mb-4"
      style={{ background: "var(--paper)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-semibold" style={{ color: "var(--ink)" }}>{t("tieBreakers")}</h2>
        {isClosed && (
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
          >
            {t("tieBreakerClosed")}
          </span>
        )}
      </div>
      {isClosed ? (
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>{t("tieBreakerClosedDesc")}</p>
      ) : (
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>{t("tieBreakerDesc")}</p>
      )}
      <div className="space-y-4">
        {questions.map((q) => {
          const promptText = q.prompt[locale] ?? q.prompt["en"] ?? Object.values(q.prompt)[0] ?? "";
          return (
            <div key={q.id}>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--ink)" }}>
                {promptText}
              </label>
              <input
                type={q.type === "NUMBER" ? "number" : "text"}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                readOnly={isClosed}
                disabled={isClosed}
                className="field"
                style={isClosed ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
              />
            </div>
          );
        })}
      </div>
      {!isClosed && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t("saving") : t("tieBreakerSave")}
          </button>
          {savedMsg === "ok" && (
            <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>{t("tieBreakerSaved")}</span>
          )}
          {savedMsg === "error" && (
            <span className="text-sm font-medium" style={{ color: "var(--live)" }}>{t("errorSaving")}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stage Card ───────────────────────────────────────────────────────────────

function StageCard({
  stage,
  prediction,
  score,
  groupId,
  teams,
  matches,
  defaultOpen,
  canSubmitLate,
  onPredictionUpdate,
}: {
  stage: Stage;
  prediction: StagePrediction;
  score: StageScore;
  groupId: string;
  teams: Team[];
  matches: StageMatch[];
  defaultOpen: boolean;
  canSubmitLate: boolean;
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
  // Render the pick form when the stage is OPEN, or when an admin granted this
  // member a late-submission allowance for a missing prediction (e.g. the stage
  // already closed). In both cases only while they haven't submitted yet.
  const showForm = (stage.status === "OPEN" || canSubmitLate) && !isSubmitted;

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
              <ReadOnlyPicks stage={stage} prediction={prediction} score={score} teams={teams} matches={matches} />
            </div>
          )}

          {stage.status === "OPEN" && !isSubmitted && prediction?.unlockedAt && (
            <div
              className="p-3 rounded-lg text-sm flex items-center gap-2"
              style={{ background: "var(--gold-soft)", border: "1px solid var(--gold)", color: "var(--gold)" }}
            >
              <span aria-hidden>🔓</span>
              {t("unlockedNotice")}
            </div>
          )}

          {canSubmitLate && stage.status !== "OPEN" && (
            <div
              className="p-3 rounded-lg text-sm flex items-center gap-2"
              style={{ background: "var(--gold-soft)", border: "1px solid var(--gold)", color: "var(--gold)" }}
            >
              <span aria-hidden>⏳</span>
              {t("lateSubmissionNotice")}
            </div>
          )}

          {showForm && stage.type === "GROUP_QUALIFICATION" && teams.length > 0 && (
            <GroupQualificationForm
              stage={stage}
              groupId={groupId}
              teams={teams}
              existing={prediction}
              onSaved={(pred) => onPredictionUpdate(stage.id, pred)}
            />
          )}

          {showForm && stage.type === "KNOCKOUT" && matches.length > 0 && (
            <KnockoutForm
              stage={stage}
              groupId={groupId}
              matches={matches}
              existing={prediction}
              onSaved={(pred) => onPredictionUpdate(stage.id, pred)}
            />
          )}

          {(stage.status === "CLOSED" || stage.status === "SCORED") && !showForm && (
            <ReadOnlyPicks stage={stage} prediction={prediction} score={score} teams={teams} matches={matches} />
          )}

          {stage.status === "SCORED" && (
            <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs font-medium uppercase tracking-wide mb-1 muted">{t("pointsEarned")}</p>
              <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{score?.points ?? "–"}</p>
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
  const [scores, setScores] = useState<Record<string, StageScore>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [matchesByStage, setMatchesByStage] = useState<Record<string, StageMatch[]>>({});
  const [lateGrants, setLateGrants] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || !tournamentId) return;
    let cancelled = false;

    // `silent` skips the loading skeleton so live refreshes don't flash the UI.
    async function load(silent: boolean) {
      if (!silent) setLoading(true);
      try {
        const stagesRes = await fetch(`/api/staged/tournaments/${tournamentId}/stages`);
        const stagesData = await stagesRes.json();
        const fetchedStages: Stage[] = stagesData.stages ?? [];
        if (cancelled) return;
        setStages(fetchedStages);

        const predEntries = await Promise.all(
          fetchedStages.map(async (s) => {
            const res = await fetch(`/api/staged/groups/${groupId}/stages/${s.id}/prediction`);
            const data = await res.json();
            return [s.id, data.prediction ?? null, data.score ?? null, !!data.canSubmitLate] as [string, StagePrediction, StageScore, boolean];
          })
        );
        if (cancelled) return;
        setPredictions(Object.fromEntries(predEntries.map(([id, pred]) => [id, pred])));
        setScores(Object.fromEntries(predEntries.map(([id, , score]) => [id, score])));
        setLateGrants(Object.fromEntries(predEntries.map(([id, , , late]) => [id, late])));

        const gqOpen = fetchedStages.find((s) => s.type === "GROUP_QUALIFICATION" && s.status !== "UPCOMING");
        if (gqOpen) {
          const teamsRes = await fetch("/api/teams");
          const teamsData = await teamsRes.json();
          if (cancelled) return;
          setTeams(teamsData.teams ?? []);
        }

        const knockoutActive = fetchedStages.filter((s) => s.type === "KNOCKOUT" && s.status !== "UPCOMING");
        if (knockoutActive.length > 0) {
          const matchEntries = await Promise.all(
            knockoutActive.map(async (s) => {
              const res = await fetch(`/api/staged/stages/${s.id}/matches`);
              const data = await res.json();
              return [s.id, data.matches ?? []] as [string, StageMatch[]];
            })
          );
          if (cancelled) return;
          setMatchesByStage(Object.fromEntries(matchEntries));
        }

      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    }

    load(false);
    // Results land while stages are still open, so poll + refresh on focus to keep the comparison live.
    const interval = setInterval(() => load(true), 30_000);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [groupId, tournamentId]);

  function handlePredictionUpdate(stageId: string, pred: StagePrediction) {
    setPredictions((prev) => ({ ...prev, [stageId]: pred }));
  }

  const openStageIndex = stages.findIndex((s) => s.status === "OPEN");

  const recap = stages.reduce(
    (acc, s) => {
      const score = scores[s.id];
      if (score) {
        acc.points += score.points;
        acc.correct += score.correctPicks;
      }
      const hasResults =
        (Array.isArray(s.qualificationResult?.qualifiers) && s.qualificationResult.qualifiers.length > 0) ||
        (matchesByStage[s.id]?.some((m) => m.winnerId) ?? false);
      if (hasResults && s.status !== "SCORED") acc.live += 1;
      return acc;
    },
    { points: 0, correct: 0, live: 0 }
  );
  const showRecap = stages.some((s) => scores[s.id]);

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

        {showRecap && (
          <div
            className="rounded-xl p-5 mb-4"
            style={{ background: "var(--paper)", border: "1px solid var(--border)" }}
          >
            <p className="text-xs font-medium uppercase tracking-wide muted">{t("recapTitle")}</p>
            <p className="text-lg font-semibold mt-1" style={{ color: "var(--ink)" }}>
              {t("recapSummary", { points: recap.points, correct: recap.correct, live: recap.live })}
            </p>
          </div>
        )}

        <TieBreakerSection groupId={groupId} />

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
                score={scores[stage.id] ?? null}
                groupId={groupId}
                teams={teams}
                matches={matchesByStage[stage.id] ?? []}
                defaultOpen={i === openStageIndex || (lateGrants[stage.id] ?? false)}
                canSubmitLate={lateGrants[stage.id] ?? false}
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
