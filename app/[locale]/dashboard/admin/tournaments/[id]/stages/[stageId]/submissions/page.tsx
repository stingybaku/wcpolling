"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StageInfo = {
  id: string;
  name: string;
  type: "GROUP_QUALIFICATION" | "KNOCKOUT";
  status: "UPCOMING" | "OPEN" | "CLOSED" | "SCORED";
  tournamentId: string;
  closesAt?: string | null;
  qualifiers: string[] | null;
};

type Submission = {
  id: string;
  userId: string;
  groupId: string;
  qualificationPicks?: string[] | null;
  matchPicks?: { matchId: string; winnerId: string }[] | null;
  submittedAt?: string | null;
  unlockCount: number;
  updatedAt: string;
  user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  group: { id: string; name: string };
  score: { points: number; correctPicks: number } | null;
};

type StageMatch = {
  id: string;
  matchNumber: string;
  winnerId?: string | null;
  homeTeam?: { id: string; name: string; fifaCode: string } | null;
  awayTeam?: { id: string; name: string; fifaCode: string } | null;
};

type Team = { id: string; name: string; fifaCode: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Pick detail views ────────────────────────────────────────────────────────

function QualificationPicks({
  picks,
  teamsById,
  qualifiers,
}: {
  picks: string[];
  teamsById: Map<string, Team>;
  qualifiers: string[] | null;
}) {
  const qualifierSet = qualifiers ? new Set(qualifiers) : null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {picks.map((teamId) => {
        const team = teamsById.get(teamId);
        const correct = qualifierSet?.has(teamId);
        return (
          <span
            key={teamId}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={
              qualifierSet
                ? correct
                  ? { background: "color-mix(in srgb, #22c55e 15%, transparent)", color: "#4ade80" }
                  : { background: "color-mix(in srgb, var(--live) 12%, transparent)", color: "var(--live)" }
                : { background: "var(--paper-2, var(--paper))", border: "1px solid var(--border)", color: "var(--ink)" }
            }
            title={team?.name ?? teamId}
          >
            {team?.fifaCode ?? team?.name ?? "?"}
          </span>
        );
      })}
    </div>
  );
}

function MatchPicks({
  picks,
  matches,
}: {
  picks: { matchId: string; winnerId: string }[];
  matches: StageMatch[];
}) {
  const pickByMatch = new Map(picks.map((p) => [p.matchId, p.winnerId]));
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {matches.map((match) => {
        const pickedId = pickByMatch.get(match.id);
        const picked =
          pickedId === match.homeTeam?.id ? match.homeTeam : pickedId === match.awayTeam?.id ? match.awayTeam : null;
        const resolved = !!match.winnerId;
        const correct = resolved && pickedId === match.winnerId;
        return (
          <div
            key={match.id}
            className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <span className="muted">
              {match.homeTeam?.fifaCode ?? "?"} vs {match.awayTeam?.fifaCode ?? "?"}
            </span>
            {pickedId ? (
              <span
                className="font-bold"
                style={{ color: resolved ? (correct ? "#4ade80" : "var(--live)") : "var(--ink)" }}
                title={picked?.name}
              >
                {picked?.fifaCode ?? "?"}
                {resolved && (correct ? " ✓" : " ✗")}
              </span>
            ) : (
              <span className="muted-2">no pick</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Submission row ───────────────────────────────────────────────────────────

function SubmissionRow({
  submission,
  stage,
  matches,
  teamsById,
}: {
  submission: Submission;
  stage: StageInfo;
  matches: StageMatch[];
  teamsById: Map<string, Team>;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSubmitted = !!submission.submittedAt;
  const picks =
    stage.type === "GROUP_QUALIFICATION" ? submission.qualificationPicks ?? [] : submission.matchPicks ?? [];
  const hasPicks = picks.length > 0;

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--paper)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" style={{ color: "var(--ink)" }}>
            {submission.user.name ?? submission.user.email ?? "Unknown user"}
          </p>
          <p className="truncate text-xs muted">
            {submission.group.name}
            {submission.user.email && submission.user.name ? ` · ${submission.user.email}` : ""}
          </p>
        </div>

        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest"
          style={
            isSubmitted
              ? { background: "color-mix(in srgb, #22c55e 15%, transparent)", color: "#4ade80" }
              : { background: "color-mix(in srgb, #f59e0b 15%, transparent)", color: "#fbbf24" }
          }
        >
          {isSubmitted ? "Submitted" : "Draft"}
        </span>

        <div className="text-right">
          <p className="text-xs muted">{isSubmitted ? formatDate(submission.submittedAt) : `saved ${formatDate(submission.updatedAt)}`}</p>
          {submission.score && (
            <p className="text-xs font-bold" style={{ color: "var(--ink)" }}>
              {submission.score.points} pts · {submission.score.correctPicks} correct
            </p>
          )}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          disabled={!hasPicks}
          className="btn btn-sm btn-ghost text-xs disabled:opacity-40"
        >
          {hasPicks ? (expanded ? "Hide picks" : "View picks") : "No picks"}
        </button>
      </div>

      {expanded && hasPicks && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          {stage.type === "GROUP_QUALIFICATION" ? (
            <QualificationPicks
              picks={submission.qualificationPicks ?? []}
              teamsById={teamsById}
              qualifiers={stage.qualifiers}
            />
          ) : (
            <MatchPicks picks={submission.matchPicks ?? []} matches={matches} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StageSubmissionsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string; stageId: string; locale: string }>();
  const { id: tournamentId, stageId } = params;

  const [stage, setStage] = useState<StageInfo | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [matches, setMatches] = useState<StageMatch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");

  // Auth guard
  useEffect(() => {
    if (authStatus === "loading") return;
    if ((session?.user as { role?: string } | undefined)?.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [session, authStatus, router]);

  const fetchData = useCallback(async () => {
    if (!stageId) return;
    setError("");
    try {
      const res = await fetch(`/api/admin/staged/stages/${stageId}/submissions`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load submissions");
      setStage(data.stage);
      setSubmissions(data.submissions ?? []);

      if (data.stage.type === "KNOCKOUT") {
        const mRes = await fetch(`/api/admin/staged/stages/${stageId}/matches`);
        if (mRes.ok) setMatches((await mRes.json()).matches ?? []);
      } else {
        const tRes = await fetch("/api/admin/teams");
        if (tRes.ok) setTeams((await tRes.json()).teams ?? []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load submissions");
    }
  }, [stageId]);

  useEffect(() => {
    if (authStatus === "loading" || (session?.user as { role?: string } | undefined)?.role !== "ADMIN") return;
    fetchData().finally(() => setLoading(false));
  }, [authStatus, session, fetchData]);

  if (authStatus === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <p className="muted text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8" style={{ background: "var(--bg)" }}>
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: "color-mix(in srgb, var(--live) 10%, transparent)", border: "1px solid var(--live)" }}
        >
          <p className="font-semibold" style={{ color: "var(--live)" }}>{error}</p>
          <button onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }} className="btn mt-4 text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stage) return null;

  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const groups = [...new Map(submissions.map((s) => [s.group.id, s.group])).values()];
  const visible = groupFilter === "all" ? submissions : submissions.filter((s) => s.group.id === groupFilter);
  const submittedCount = visible.filter((s) => s.submittedAt).length;
  const draftCount = visible.length - submittedCount;

  return (
    <div className="min-h-screen px-4 py-8 md:px-8" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-4xl">
        {/* Page header */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted mb-1">Stage Submissions</p>
          <h1 className="text-3xl font-bold" style={{ color: "var(--ink)" }}>{stage.name}</h1>
          <p className="mt-1 text-sm muted">
            {stage.status} · closes {formatDate(stage.closesAt)}
          </p>
          <a
            href={`/dashboard/admin/tournaments/${tournamentId}/staged`}
            className="mt-3 inline-block btn btn-sm btn-ghost"
          >
            ← Manage Stages
          </a>
        </div>

        {/* Summary + filter */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <p className="text-sm muted">
            <span className="font-bold" style={{ color: "var(--ink)" }}>{submittedCount}</span> submitted
            {draftCount > 0 && (
              <>
                {" · "}
                <span className="font-bold" style={{ color: "var(--ink)" }}>{draftCount}</span> draft{draftCount === 1 ? "" : "s"}
              </>
            )}
          </p>
          {groups.length > 1 && (
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="field ml-auto w-auto text-xs"
            >
              <option value="all">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Submissions */}
        {visible.length === 0 ? (
          <div
            className="rounded-3xl p-10 text-center"
            style={{ background: "var(--paper)", border: "1px solid var(--border)" }}
          >
            <p className="muted text-sm">No predictions for this stage yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((submission) => (
              <SubmissionRow
                key={submission.id}
                submission={submission}
                stage={stage}
                matches={matches}
                teamsById={teamsById}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
