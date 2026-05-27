"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
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
  qualificationResult: { id: string } | null;
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
};

type StageMatch = {
  id: string;
  matchNumber: number;
  homeTeam: Team | null;
  awayTeam: Team | null;
  winnerId: string | null;
};

type LeaderboardEntry = {
  userId: string;
  userName: string | null;
  userImage: string | null;
  totalPoints: number;
  totalCorrectPicks: number;
  stages: { stageId: string; stageName: string; points: number; correctPicks: number }[];
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
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(closesAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Closed"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [closesAt]);

  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Closes in {remaining}
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
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(existing?.qualificationPicks ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
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
      setError(e instanceof Error ? e.message : "Error saving prediction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Select the <span className="font-semibold">32 teams</span> you think will qualify from the group stage.
        </p>
        <span className={`text-sm font-semibold ${selected.size === 32 ? "text-green-600" : "text-gray-500"}`}>
          {selected.size} / 32 selected
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {teams.map((team) => {
          const isSelected = selected.has(team.id);
          return (
            <button
              key={team.id}
              onClick={() => toggle(team.id)}
              className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs font-medium transition-all ${
                isSelected
                  ? "border-green-500 bg-green-50 text-green-800"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {isSelected && (
                <span className="absolute top-1 right-1 text-green-500">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
              <span className="text-xl leading-none">{flagEmoji(team.fifaCode)}</span>
              <span className="text-center leading-tight">{team.name}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving || selected.size === 0}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save Draft"}
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving || selected.size !== 32}
          className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Submitting…" : "Submit Picks"}
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
      setError(e instanceof Error ? e.message : "Error saving prediction");
    } finally {
      setSaving(false);
    }
  }

  const pickedCount = Object.keys(picks).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Pick the winner for each match.</p>
        <span className={`text-sm font-semibold ${pickedCount === matches.length ? "text-green-600" : "text-gray-500"}`}>
          {pickedCount} / {matches.length} matches picked
        </span>
      </div>

      <div className="space-y-3">
        {matches.map((match) => {
          const winner = picks[match.id];
          return (
            <div key={match.id} className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-white">
              <span className="text-xs text-gray-400 w-6 text-center font-medium">{match.matchNumber}</span>
              {[match.homeTeam, match.awayTeam].map((team) => {
                if (!team) return null;
                const isWinner = winner === team.id;
                return (
                  <button
                    key={team.id}
                    onClick={() => pick(match.id, team.id)}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      isWinner
                        ? "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-white"
                    }`}
                  >
                    <span className="text-lg">{flagEmoji(team.fifaCode)}</span>
                    <span>{team.name}</span>
                    {isWinner && (
                      <svg className="w-4 h-4 text-blue-500 ml-auto" fill="currentColor" viewBox="0 0 20 20">
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving || pickedCount === 0}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save Draft"}
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving || pickedCount !== matches.length}
          className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Submitting…" : "Submit Picks"}
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
  if (!prediction) return <p className="text-sm text-gray-500 italic">No picks submitted.</p>;

  if (stage.type === "GROUP_QUALIFICATION" && prediction.qualificationPicks) {
    const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]));
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {prediction.qualificationPicks.map((id) => {
          const team = teamMap[id];
          if (!team) return null;
          return (
            <div key={id} className="flex flex-col items-center gap-1 p-2 rounded-lg border border-green-200 bg-green-50 text-xs font-medium text-green-800">
              <span className="text-xl">{flagEmoji(team.fifaCode)}</span>
              <span className="text-center">{team.name}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (stage.type === "KNOCKOUT" && prediction.matchPicks) {
    const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]));
    const matchMap = Object.fromEntries(matches.map((m) => [m.id, m]));
    return (
      <div className="space-y-2">
        {prediction.matchPicks.map((p) => {
          const match = matchMap[p.matchId];
          const winner = teamMap[p.winnerId];
          if (!match || !winner) return null;
          return (
            <div key={p.matchId} className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 w-6 text-center">{match.matchNumber}</span>
              <span className="text-lg">{flagEmoji(winner.fifaCode)}</span>
              <span className="font-medium">{winner.name}</span>
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
  const [open, setOpen] = useState(defaultOpen);

  const statusColors: Record<StageStatus, string> = {
    UPCOMING: "bg-gray-100 text-gray-500",
    OPEN: "bg-green-100 text-green-700",
    CLOSED: "bg-amber-100 text-amber-700",
    SCORED: "bg-blue-100 text-blue-700",
  };

  const isSubmitted = !!prediction?.submittedAt;

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-opacity ${stage.status === "UPCOMING" ? "opacity-60" : ""}`}>
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
        disabled={stage.status === "UPCOMING"}
      >
        <div className="flex items-center gap-3">
          {stage.status === "UPCOMING" && (
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v3m0-3h3m-3 0h-3m0-6V4m0 0V1m0 3h3m-3 0H9" />
            </svg>
          )}
          <div>
            <p className="font-semibold text-gray-900">{stage.name}</p>
            {stage.roundLabel && <p className="text-xs text-gray-500">{stage.roundLabel}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stage.status === "UPCOMING" && (
            <span className="text-xs text-gray-400">Opens {formatDate(stage.opensAt)}</span>
          )}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[stage.status]}`}>
            {stage.status === "SCORED" ? "Scored" : stage.status === "CLOSED" ? "Awaiting Results" : stage.status}
          </span>
          {stage.status !== "UPCOMING" && (
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {open && stage.status !== "UPCOMING" && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {stage.status === "OPEN" && (
            <div className="flex items-center justify-between">
              <Countdown closesAt={stage.closesAt} />
              {isSubmitted && (
                <span className="text-xs text-green-600 font-medium">
                  Submitted {formatDate(prediction!.submittedAt!)}
                </span>
              )}
            </div>
          )}

          {stage.status === "OPEN" && isSubmitted && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Your picks are locked in. Contact a group admin to unlock.
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
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Points earned</p>
              <p className="text-2xl font-bold text-blue-600">–</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────

function LeaderboardTab({
  leaderboard,
  stages,
  currentUserId,
}: {
  leaderboard: LeaderboardEntry[];
  stages: Stage[];
  currentUserId: string;
}) {
  const sorted = [...leaderboard].sort((a, b) => b.totalPoints - a.totalPoints);
  const scoredStages = stages.filter((s) => s.status === "SCORED");

  if (sorted.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium">No scores yet</p>
        <p className="text-sm mt-1">Leaderboard will appear once the first stage is scored.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left">#</th>
            <th className="px-4 py-3 text-left">Member</th>
            <th className="px-4 py-3 text-right">Points</th>
            <th className="px-4 py-3 text-right">Correct</th>
            {scoredStages.map((s) => (
              <th key={s.id} className="px-3 py-3 text-right whitespace-nowrap">{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((entry, i) => {
            const isMe = entry.userId === currentUserId;
            const stageMap = Object.fromEntries(entry.stages.map((s) => [s.stageId, s]));
            return (
              <tr
                key={entry.userId}
                className={`${isMe ? "bg-blue-50 font-semibold" : "bg-white hover:bg-gray-50"} transition-colors`}
              >
                <td className="px-4 py-3 text-gray-500 font-medium">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </td>
                <td className="px-4 py-3 text-gray-900">
                  {entry.userName ?? "Unknown"}
                  {isMe && <span className="ml-2 text-xs text-blue-500">(you)</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-900">{entry.totalPoints}</td>
                <td className="px-4 py-3 text-right text-gray-500">{entry.totalCorrectPicks}</td>
                {scoredStages.map((s) => {
                  const stageData = stageMap[s.id];
                  return (
                    <td key={s.id} className="px-3 py-3 text-right text-gray-500">
                      {stageData ? stageData.points : "–"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const { groupId, tournamentId } = useParams<{ groupId: string; tournamentId: string }>();
  const { data: session } = useSession();

  const [stages, setStages] = useState<Stage[]>([]);
  const [predictions, setPredictions] = useState<Record<string, StagePrediction>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [matchesByStage, setMatchesByStage] = useState<Record<string, StageMatch[]>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"predictions" | "leaderboard">("predictions");

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

        const gqOpen = fetchedStages.find((s) => s.type === "GROUP_QUALIFICATION" && s.status === "OPEN");
        if (gqOpen) {
          const teamsRes = await fetch("/api/admin/teams");
          const teamsData = await teamsRes.json();
          setTeams(teamsData.teams ?? []);
        }

        const knockoutOpen = fetchedStages.filter((s) => s.type === "KNOCKOUT" && s.status === "OPEN");
        if (knockoutOpen.length > 0) {
          const matchEntries = await Promise.all(
            knockoutOpen.map(async (s) => {
              const res = await fetch(`/api/admin/staged/stages/${s.id}/matches`);
              const data = await res.json();
              return [s.id, data.matches ?? []] as [string, StageMatch[]];
            })
          );
          setMatchesByStage(Object.fromEntries(matchEntries));
        }

        const lbRes = await fetch(`/api/staged/groups/${groupId}/leaderboard?tournamentId=${tournamentId}`);
        const lbData = await lbRes.json();
        setLeaderboard(lbData.leaderboard ?? []);
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={`/dashboard/groups/${groupId}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to group
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Tournament Predictions</h1>
        </div>

        <div className="flex gap-1 mb-6 bg-white rounded-xl border border-gray-200 p-1 shadow-sm w-fit">
          {(["predictions", "leaderboard"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                tab === t ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : tab === "predictions" ? (
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
              <div className="text-center py-16 text-gray-500">
                <p className="font-medium">No stages found for this tournament.</p>
              </div>
            )}
          </div>
        ) : (
          <LeaderboardTab
            leaderboard={leaderboard}
            stages={stages}
            currentUserId={session?.user?.id ?? ""}
          />
        )}
      </div>
    </div>
  );
}
