"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

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
  userName: string;
  predictionName: string;
  points: number;
  breakdown: Record<"MATCH" | "GROUP_STANDING" | "KNOCKOUT" | "TIEBREAKER", number>;
};

function buildLeaderboard(submissions: GroupDetail["submissions"]): LeaderboardRow[] {
  return submissions
    .map((submission) => {
      const breakdown = submission.scores.reduce<LeaderboardRow["breakdown"]>(
        (accumulator, score) => {
          accumulator[score.scoreType] += score.points;
          return accumulator;
        },
        { MATCH: 0, GROUP_STANDING: 0, KNOCKOUT: 0, TIEBREAKER: 0 }
      );
      return {
        userName: submission.user.name ?? submission.user.email ?? "Unknown",
        predictionName: submission.prediction.name,
        points: submission.scores.reduce((sum, score) => sum + score.points, 0),
        breakdown,
      };
    })
    .sort((a, b) => b.points - a.points);
}

export default function GroupDetailPage() {
  const params = useParams() as { groupId: string };
  const router = useRouter();
  const { data: session } = useSession();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Submission amendment state
  const [myPredictions, setMyPredictions] = useState<UserPrediction[]>([]);
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
    if (res.status === 403) {
      router.push("/dashboard/groups?error=not-member");
      return;
    }
    if (!res.ok) {
      setError("Could not load group.");
      return;
    }
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
  }, [params.groupId]);

  async function submitPrediction() {
    setError("");
    setSuccess("");
    setSubmitting(true);
    const res = await fetch(`/api/groups/${params.groupId}/submit`, { method: "POST" });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Submit failed. Make sure you have selected a prediction first.");
      return;
    }
    setSuccess("Prediction submitted successfully.");
    await loadGroup();
  }

  async function updateSubmission() {
    if (!newPredictionId) return;
    setError("");
    setSuccess("");
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
    setError("");
    setLeaving(true);
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
      <section className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>Group room</p>
            <h2 className="display-title mt-3 text-5xl leading-none md:text-7xl">{group?.name ?? "Loading"}</h2>
            <p className="mt-4 text-base muted">Tournament: {group?.tournament?.name ?? "-"}</p>
            <div className="mt-2 flex items-center gap-3">
              <p className="text-base muted">Invite code: <span className="font-bold">{group?.inviteCode ?? "-"}</span></p>
              {group?.inviteCode && (
                <button
                  type="button"
                  onClick={copyInviteCode}
                  className="rounded-full border px-3 py-1 text-xs font-bold"
                  style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
                >
                  {copiedCode ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
          </div>
          <Link href="/dashboard/groups" className="surface rounded-[1.4rem] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em]">Back to groups</Link>
        </div>
      </section>

      {error ? <div className="rounded-[1.5rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 10%, transparent 90%)" }}>{error}</div> : null}
      {success ? <div className="rounded-[1.5rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--accent-soft)" }}>{success}</div> : null}

      <section className="content-grid">
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

          <div className="mt-5 space-y-3">
            {mySubmission ? (
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-[0.2em]" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
                    Submitted: {mySubmission.prediction.name}
                  </div>
                  <button
                    type="button"
                    className="rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.2em]"
                    style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
                    onClick={async () => {
                      setChangingSubmission((prev) => !prev);
                      if (!changingSubmission) await loadMyPredictions();
                    }}
                  >
                    {changingSubmission ? "Cancel" : "Change submission"}
                  </button>
                </div>
                {changingSubmission && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <select
                      className="field"
                      value={newPredictionId}
                      onChange={(e) => setNewPredictionId(e.target.value)}
                    >
                      <option value="">Select a prediction</option>
                      {myPredictions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                      style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                      onClick={() => void updateSubmission()}
                      disabled={!newPredictionId || updatingSubmission}
                    >
                      {updatingSubmission ? "Updating..." : "Confirm change"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => void submitPrediction()}
                disabled={submitting}
                className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
              >
                {submitting ? "Submitting..." : "Submit selected prediction"}
              </button>
            )}

            {!isOwner && group && (
              <div>
                {confirmLeave ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm muted">Leave this group?</span>
                    <button
                      type="button"
                      className="rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-white"
                      style={{ background: "var(--danger)" }}
                      onClick={() => void leaveGroup()}
                      disabled={leaving}
                    >
                      {leaving ? "Leaving..." : "Yes, leave"}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em]"
                      style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
                      onClick={() => setConfirmLeave(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.2em]"
                    style={{ borderColor: "var(--border)", color: "var(--danger)", background: "var(--bg-strong)" }}
                    onClick={() => setConfirmLeave(true)}
                  >
                    Leave group
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

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
