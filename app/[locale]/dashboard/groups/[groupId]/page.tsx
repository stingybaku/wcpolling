"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Link } from "@/lib/navigation";
import { flagEmoji } from "@/lib/fifa-flags";
import {
  buildGroupStandingsMap,
  buildKnockoutPicksMap,
  computeResolvedTeams,
  inferThirdPlaceRanking,
  PredictionGroup,
  PredictionMatch,
  PredictionTeam,
} from "@/lib/prediction-utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type GroupDetail = {
  id: string;
  name: string;
  description?: string;
  inviteCode: string;
  ownerId: string;
  tournament?: { name: string } | null;
  owner: { email?: string | null; name?: string | null };
  memberships: Array<{ user: { id: string; email?: string | null; name?: string | null } }>;
  submissions: Array<{
    id: string;
    user: { id: string; email?: string | null; name?: string | null };
    prediction: { id: string; name: string };
    scores: Array<{ points: number; scoreType: "MATCH" | "GROUP_STANDING" | "KNOCKOUT" | "TIEBREAKER"; label?: string | null }>;
  }>;
};

type UserPrediction = { id: string; name: string };

type LeaderboardRow = {
  userId: string;
  userName: string;
  predictionName: string;
  points: number;
  breakdown: Record<"MATCH" | "GROUP_STANDING" | "KNOCKOUT" | "TIEBREAKER", number>;
};

type PreviewData = {
  prediction: {
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
  tournament: { id: string; name: string; groups: PredictionGroup[]; tieBreakers: { id: string; prompt: string }[] };
  matches: PredictionMatch[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildLeaderboard(submissions: GroupDetail["submissions"]): LeaderboardRow[] {
  return submissions
    .map((sub) => {
      const breakdown = sub.scores.reduce<LeaderboardRow["breakdown"]>(
        (acc, s) => { acc[s.scoreType] += s.points; return acc; },
        { MATCH: 0, GROUP_STANDING: 0, KNOCKOUT: 0, TIEBREAKER: 0 }
      );
      return {
        userId: sub.user.id,
        userName: sub.user.name ?? sub.user.email ?? "Unknown",
        predictionName: sub.prediction.name,
        points: sub.scores.reduce((sum, s) => sum + s.points, 0),
        breakdown,
      };
    })
    .sort((a, b) => b.points - a.points);
}

// ─── Preview modal ────────────────────────────────────────────────────────────

function PredictionPreviewModal({ predictionId, onClose }: { predictionId: string; onClose: () => void }) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/predictions/${predictionId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [predictionId]);

  // Close on backdrop click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pred = data?.prediction;
  const tournament = data?.tournament;
  const matches = data?.matches ?? [];

  const allTeams = new Map<string, PredictionTeam>();
  for (const g of tournament?.groups ?? []) {
    for (const { team } of g.teams) allTeams.set(team.id, team);
  }

  const groupStandings = pred ? buildGroupStandingsMap(pred.groupStandings) : {};
  const knockoutPicks = pred ? buildKnockoutPicksMap(pred.entries) : {};
  const thirdPlaceRanking = pred
    ? pred.thirdPlaceRankings.length > 0
      ? pred.thirdPlaceRankings.map((r) => r.teamId)
      : inferThirdPlaceRanking(tournament?.groups ?? [], groupStandings, pred.entries)
    : [];
  const resolvedTeams = pred
    ? computeResolvedTeams(matches, tournament?.groups ?? [], groupStandings, thirdPlaceRanking, knockoutPicks)
    : {};

  const knockoutPhases = matches
    .map((m) => m.phase)
    .filter((p) => p.isKnockout)
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function teamName(id: string | null | undefined) {
    if (!id) return null;
    const t = allTeams.get(id);
    return t ? `${flagEmoji(t.fifaCode)} ${t.name}` : null;
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-10"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={handleOverlayClick}
    >
      <div
        className="relative w-full max-w-3xl rounded-[2rem] p-6 md:p-8"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Prediction preview</p>
            <h3 className="mt-1 text-2xl font-extrabold">{pred?.name ?? "Loading…"}</h3>
            {pred?.description && <p className="mt-1 text-sm muted">{pred.description}</p>}
          </div>
          <button
            className="rounded-full p-2 text-lg font-bold"
            style={{ background: "var(--bg-strong)" }}
            onClick={onClose}
          >✕</button>
        </div>

        {loading && <p className="muted text-sm">Loading prediction…</p>}

        {!loading && pred && (
          <div className="space-y-8">
            {/* Group standings */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] muted">Group standings</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {(tournament?.groups ?? []).map((group) => {
                  const standing = groupStandings[group.id] ?? [];
                  return (
                    <div key={group.id} className="rounded-[1.2rem] border p-3" style={{ borderColor: "var(--border)" }}>
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "var(--accent-strong)" }}>Group {group.name}</p>
                      <ol className="space-y-1">
                        {standing.map((teamId, i) => {
                          const t = allTeams.get(teamId);
                          return (
                            <li key={teamId} className="flex items-center gap-1.5 text-xs">
                              <span className="muted w-3">{i + 1}.</span>
                              <span>{t ? flagEmoji(t.fifaCode) : ""}</span>
                              <span className="truncate font-medium">{t?.name ?? "?"}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Third-place qualifiers */}
            {thirdPlaceRanking.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] muted">Best third-place (top 8 qualify)</p>
                <div className="flex flex-wrap gap-2">
                  {thirdPlaceRanking.map((teamId, i) => {
                    const t = allTeams.get(teamId);
                    return (
                      <span
                        key={teamId}
                        className="rounded-full px-3 py-1.5 text-xs font-semibold"
                        style={{
                          background: i < 8 ? "var(--accent-soft)" : "var(--bg-strong)",
                          color: i < 8 ? "var(--accent-strong)" : "var(--muted)",
                        }}
                      >
                        {i + 1}. {t ? `${flagEmoji(t.fifaCode)} ${t.name}` : "?"}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Knockout picks */}
            {knockoutPhases.map((phase) => {
              const phaseMatches = matches
                .filter((m) => m.phase.id === phase.id)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <div key={phase.id}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] muted">{phase.name}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {phaseMatches.map((match) => {
                      const resolved = resolvedTeams[match.id];
                      const homeTeamId = resolved?.home;
                      const awayTeamId = resolved?.away;
                      const entry = pred.entries.find((e) => e.matchId === match.id);
                      const predHomeId = entry?.predictedHomeTeamId;
                      const predAwayId = entry?.predictedAwayTeamId;
                      const hs = entry?.predictedHomeScore;
                      const as_ = entry?.predictedAwayScore;
                      const hasScore = hs != null && as_ != null;
                      const winnerId = hasScore && hs !== as_ ? (hs! > as_! ? predHomeId : predAwayId) : null;

                      return (
                        <div
                          key={match.id}
                          className="rounded-[1.1rem] border px-3 py-2.5 text-sm"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {[
                            { teamId: homeTeamId, predTeamId: predHomeId, score: hs },
                            { teamId: awayTeamId, predTeamId: predAwayId, score: as_ },
                          ].map(({ teamId, predTeamId, score }, ri) => {
                            const isWinner = !!winnerId && winnerId === predTeamId;
                            const isLoser = !!winnerId && !!predTeamId && winnerId !== predTeamId;
                            const t = allTeams.get(predTeamId ?? teamId ?? "");
                            return (
                              <div
                                key={ri}
                                className="flex items-center justify-between gap-2 py-0.5"
                                style={{ opacity: isLoser ? 0.45 : 1, fontWeight: isWinner ? 700 : 400 }}
                              >
                                <span className="truncate">
                                  {t ? `${flagEmoji(t.fifaCode)} ${t.name}` : <span className="muted">TBD</span>}
                                </span>
                                {hasScore && <span className="tabular-nums font-bold">{ri === 0 ? hs : as_}</span>}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Tie-breakers */}
            {pred.tieBreakerAnswers.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] muted">Tie-breakers</p>
                <div className="space-y-2">
                  {pred.tieBreakerAnswers.map((a) => {
                    const q = tournament?.tieBreakers.find((tb) => tb.id === a.questionId);
                    return (
                      <div key={a.questionId} className="flex items-center justify-between gap-4 rounded-[1rem] border px-4 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}>
                        <span className="muted">{q?.prompt ?? a.questionId}</span>
                        <span className="font-bold">{a.answer}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2">
              <Link href={`/dashboard/predictions/${pred.id}`} className="text-sm underline muted">
                View full prediction →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GroupDetailPage() {
  const params = useParams() as { groupId: string };
  const router = useRouter();
  const { data: session } = useSession();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null); // predictionId being submitted
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [myPredictions, setMyPredictions] = useState<UserPrediction[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Change-submission state
  const [changingSubmission, setChangingSubmission] = useState(false);
  const [newPredictionId, setNewPredictionId] = useState("");
  const [updatingSubmission, setUpdatingSubmission] = useState(false);

  const currentUserEmail = session?.user?.email;
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  const mySubmission = group?.submissions.find(
    (s) => s.user.email === currentUserEmail || s.user.id === currentUserId
  );
  const isOwner = group?.ownerId === currentUserId || group?.owner.email === currentUserEmail;

  async function loadGroup() {
    const res = await fetch(`/api/groups/${params.groupId}`);
    if (res.status === 403) { router.push("/dashboard/groups?error=not-member"); return; }
    if (!res.ok) { setError("Could not load group."); return; }
    const data = await res.json();
    setGroup(data.group);
    setLeaderboard(buildLeaderboard(data.group.submissions ?? []));
    setError("");
  }

  async function loadMyPredictions() {
    const res = await fetch("/api/predictions");
    if (!res.ok) return;
    const data = await res.json();
    setMyPredictions((data.predictions ?? []).map((p: UserPrediction) => ({ id: p.id, name: p.name })));
  }

  useEffect(() => {
    void loadGroup();
    void loadMyPredictions();
  }, [params.groupId]);

  async function submitPrediction(predictionId: string) {
    setError(""); setSuccess("");
    setSubmitting(predictionId);
    const res = await fetch(`/api/groups/${params.groupId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predictionId }),
    });
    setSubmitting(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Submit failed.");
      return;
    }
    setSuccess("Prediction submitted successfully.");
    await loadGroup();
  }

  async function updateSubmission() {
    if (!newPredictionId) return;
    setError(""); setSuccess("");
    setUpdatingSubmission(true);
    const res = await fetch(`/api/groups/${params.groupId}/submit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predictionId: newPredictionId }),
    });
    setUpdatingSubmission(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not update submission.");
      return;
    }
    setSuccess("Submission updated.");
    setChangingSubmission(false);
    setNewPredictionId("");
    await loadGroup();
  }

  async function leaveGroup() {
    setError(""); setLeaving(true);
    const res = await fetch(`/api/groups/${params.groupId}/membership`, { method: "DELETE" });
    setLeaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not leave group.");
      setConfirmLeave(false);
      return;
    }
    router.push("/dashboard/groups");
  }

  function copyInviteCode() {
    if (!group?.inviteCode) return;
    void navigator.clipboard.writeText(group.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Preview modal */}
      {previewId && (
        <PredictionPreviewModal
          predictionId={previewId}
          onClose={() => setPreviewId(null)}
        />
      )}

      {/* Hero */}
      <section className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>Group room</p>
            <h2 className="display-title mt-3 text-5xl leading-none md:text-7xl">{group?.name ?? "Loading"}</h2>
            <p className="mt-4 text-base muted">Tournament: {group?.tournament?.name ?? "-"}</p>
            <div className="mt-2 flex items-center gap-3">
              <p className="text-base muted">Invite code: <span className="font-bold">{group?.inviteCode ?? "-"}</span></p>
              {group?.inviteCode && (
                <button type="button" onClick={copyInviteCode} className="rounded-full border px-3 py-1 text-xs font-bold" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                  {copiedCode ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
          </div>
          <Link href="/dashboard/groups" className="surface rounded-[1.4rem] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em]">Back to groups</Link>
        </div>
      </section>

      {error && <div className="rounded-[1.5rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 10%, transparent 90%)" }}>{error}</div>}
      {success && <div className="rounded-[1.5rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--accent-soft)" }}>{success}</div>}

      <section className="content-grid">
        {/* Room details + leave */}
        <div className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Room details</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] muted">Description</p>
              <p className="mt-2 text-base">{group?.description ?? "No description"}</p>
            </div>
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] muted">Owner</p>
              <p className="mt-2 text-base">{group?.owner?.name ?? group?.owner?.email ?? "Unknown"}</p>
            </div>
          </div>
          {!isOwner && group && (
            <div className="mt-5">
              {confirmLeave ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm muted">Leave this group?</span>
                  <button type="button" className="rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-white" style={{ background: "var(--danger)" }} onClick={() => void leaveGroup()} disabled={leaving}>
                    {leaving ? "Leaving..." : "Yes, leave"}
                  </button>
                  <button type="button" className="rounded-full border px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em]" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }} onClick={() => setConfirmLeave(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.2em]" style={{ borderColor: "var(--border)", color: "var(--danger)", background: "var(--bg-strong)" }} onClick={() => setConfirmLeave(true)}>
                  Leave group
                </button>
              )}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Leaderboard</p>
          <div className="mt-5 space-y-3">
            {leaderboard.length > 0 ? leaderboard.map((row, idx) => (
              <div key={idx} className="rounded-[1.2rem] border px-4 py-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{idx + 1}. {row.userName}</p>
                    <p className="text-xs muted">{row.predictionName}</p>
                  </div>
                  <span className="text-xl font-extrabold" style={{ color: "var(--accent-strong)" }}>{row.points}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs xl:grid-cols-4">
                  <div className="rounded-full px-3 py-2" style={{ background: "var(--bg-strong)" }}>Matches: <strong>{row.breakdown.MATCH}</strong></div>
                  <div className="rounded-full px-3 py-2" style={{ background: "var(--bg-strong)" }}>Standings: <strong>{row.breakdown.GROUP_STANDING}</strong></div>
                  <div className="rounded-full px-3 py-2" style={{ background: "var(--bg-strong)" }}>Bracket: <strong>{row.breakdown.KNOCKOUT}</strong></div>
                  <div className="rounded-full px-3 py-2" style={{ background: "var(--bg-strong)" }}>Tie-breakers: <strong>{row.breakdown.TIEBREAKER}</strong></div>
                </div>
              </div>
            )) : <p className="text-base muted">No submissions yet.</p>}
          </div>
        </div>
      </section>

      {/* ── My Prediction ── */}
      <section className="surface rounded-[2rem] p-6 md:p-8">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">My prediction</p>
            <h3 className="mt-2 text-3xl font-extrabold">
              {mySubmission ? mySubmission.prediction.name : "Not submitted yet"}
            </h3>
          </div>
          {mySubmission && (
            <button
              type="button"
              className="rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.2em]"
              style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
              onClick={() => { setChangingSubmission((p) => !p); setNewPredictionId(""); }}
            >
              {changingSubmission ? "Cancel" : "Change"}
            </button>
          )}
        </div>

        {mySubmission && !changingSubmission && (
          <p className="text-sm muted mb-5">Your prediction has been submitted. The leaderboard will update as the tournament progresses.</p>
        )}

        {/* Change-submission flow */}
        {mySubmission && changingSubmission && (
          <div className="mb-6 space-y-4">
            <p className="text-sm muted">Choose a different prediction to replace your current submission.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myPredictions.filter((p) => p.id !== mySubmission.prediction.id).map((p) => (
                <div
                  key={p.id}
                  className="rounded-[1.3rem] border p-4 flex flex-col gap-3"
                  style={{
                    borderColor: newPredictionId === p.id ? "var(--accent)" : "var(--border)",
                    background: newPredictionId === p.id ? "var(--accent-soft)" : "var(--bg)",
                  }}
                >
                  <p className="font-bold text-sm">{p.name}</p>
                  <div className="flex gap-2 mt-auto">
                    <button
                      type="button"
                      className="rounded-full border px-3 py-1.5 text-xs font-bold"
                      style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
                      onClick={() => setPreviewId(p.id)}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="rounded-full px-3 py-1.5 text-xs font-bold"
                      style={{
                        background: newPredictionId === p.id ? "var(--accent)" : "var(--bg-strong)",
                        color: newPredictionId === p.id ? "#fff" : "inherit",
                      }}
                      onClick={() => setNewPredictionId((prev) => prev === p.id ? "" : p.id)}
                    >
                      {newPredictionId === p.id ? "✓ Selected" : "Select"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {newPredictionId && (
              <button
                type="button"
                className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                onClick={() => void updateSubmission()}
                disabled={updatingSubmission}
              >
                {updatingSubmission ? "Updating…" : "Confirm change"}
              </button>
            )}
          </div>
        )}

        {/* No submission yet */}
        {!mySubmission && (
          <>
            <p className="text-sm muted mb-5">You haven't submitted a prediction for this group yet.</p>
            {myPredictions.length === 0 ? (
              <div className="rounded-[1.4rem] border p-6 text-center" style={{ borderColor: "var(--border)" }}>
                <p className="font-semibold mb-2">No predictions yet</p>
                <p className="text-sm muted mb-4">Create a prediction first, then come back to submit it here.</p>
                <Link
                  href="/dashboard/predictions"
                  className="inline-block rounded-[1.2rem] px-5 py-3 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                  style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                >
                  Create a prediction
                </Link>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {myPredictions.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-[1.3rem] border p-4 flex flex-col gap-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p className="font-bold text-sm">{p.name}</p>
                    <div className="flex gap-2 mt-auto">
                      <button
                        type="button"
                        className="rounded-full border px-3 py-1.5 text-xs font-bold flex-1"
                        style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
                        onClick={() => setPreviewId(p.id)}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        className="rounded-full px-3 py-1.5 text-xs font-extrabold flex-1 text-white"
                        style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))", opacity: submitting === p.id ? 0.7 : 1 }}
                        disabled={submitting !== null}
                        onClick={() => void submitPrediction(p.id)}
                      >
                        {submitting === p.id ? "Submitting…" : "Submit"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Members */}
      <section className="surface rounded-[2rem] p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Members</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {group?.memberships.length ? group.memberships.map((m, idx) => (
            <div key={idx} className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="font-bold">{m.user.name ?? m.user.email}</p>
            </div>
          )) : <p className="text-base muted">No members yet.</p>}
        </div>
      </section>
    </div>
  );
}
