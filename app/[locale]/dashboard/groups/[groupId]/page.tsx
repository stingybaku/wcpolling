"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
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

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupDetail = {
  id: string;
  name: string;
  description?: string;
  inviteCode: string;
  ownerId: string;
  tournament?: { id: string; name: string; type: string; submissionDeadline?: string | null } | null;
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
  predictionId: string;
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
  tournament: { id: string; name: string; groups: PredictionGroup[]; tieBreakers: { id: string; prompt: Record<string, string> }[] };
  matches: PredictionMatch[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MEMBER_COLORS = ["#10b981","#f59e0b","#a855f7","#0ea5e9","#ef4444","#14b8a6","#f97316","#6366f1"];

function memberColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) { h = Math.imul(31, h) + userId.charCodeAt(i) | 0; }
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length];
}

function displayName(user: { name?: string | null; email?: string | null }): string {
  return user.name ?? user.email ?? "?";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function buildLeaderboard(submissions: GroupDetail["submissions"]): LeaderboardRow[] {
  return submissions
    .map((sub) => {
      const breakdown = sub.scores.reduce<LeaderboardRow["breakdown"]>(
        (acc, s) => { acc[s.scoreType] += s.points; return acc; },
        { MATCH: 0, GROUP_STANDING: 0, KNOCKOUT: 0, TIEBREAKER: 0 }
      );
      return {
        userId: sub.user.id,
        userName: displayName(sub.user),
        predictionId: sub.prediction.id,
        predictionName: sub.prediction.name,
        points: sub.scores.reduce((sum, s) => sum + s.points, 0),
        breakdown,
      };
    })
    .sort((a, b) => b.points - a.points);
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Avatar({ userId, name, size = 24 }: { userId: string; name: string; size?: number }) {
  const color = memberColor(userId);
  const label = initials(name);
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 999, background: color, color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: Math.max(9, Math.round(size * 0.42)),
        letterSpacing: "0.02em", flexShrink: 0, fontFamily: "var(--font-mono)",
      }}
      title={name}
    >
      {label}
    </span>
  );
}

function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    const from = prev.current;
    const start = performance.now();
    let raf: number;
    function step(t: number) {
      const k = Math.min(1, (t - start) / 800);
      const ease = 1 - Math.pow(1 - k, 3);
      setN(Math.round(from + (value - from) * ease));
      if (k < 1) raf = requestAnimationFrame(step);
      else { setN(value); prev.current = value; }
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

function MedalBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = { 1: "#d97706", 2: "#94a3b8", 3: "#a16207" };
  const color = colors[rank];
  if (!color) return <span style={{ width: 20, display: "inline-block", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>{rank}</span>;
  return (
    <span style={{
      width: 20, height: 20, borderRadius: 999, background: color, color: "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 10, fontWeight: 800, fontFamily: "var(--font-mono)", flexShrink: 0,
    }}>
      {rank}
    </span>
  );
}

function BreakdownBar({ breakdown }: { breakdown: LeaderboardRow["breakdown"] }) {
  const total = breakdown.MATCH + breakdown.GROUP_STANDING + breakdown.KNOCKOUT + breakdown.TIEBREAKER;
  if (total === 0) return (
    <div style={{ height: 14, background: "var(--border)", borderRadius: 3, minWidth: 120 }} />
  );
  return (
    <div style={{ display: "flex", gap: 2, height: 14, alignItems: "stretch", minWidth: 120 }}>
      {breakdown.MATCH > 0 && (
        <span title={`Match: ${breakdown.MATCH}`}
          style={{ flex: breakdown.MATCH, background: "var(--accent-strong)", borderRadius: "3px 0 0 3px" }} />
      )}
      {breakdown.GROUP_STANDING > 0 && (
        <span title={`Standings: ${breakdown.GROUP_STANDING}`}
          style={{ flex: breakdown.GROUP_STANDING, background: "#86efac",
            borderRadius: breakdown.MATCH === 0 ? "3px 0 0 3px" : 0 }} />
      )}
      {breakdown.KNOCKOUT > 0 && (
        <span title={`Knockout: ${breakdown.KNOCKOUT}`}
          style={{ flex: breakdown.KNOCKOUT, background: "var(--gold)",
            borderRadius: breakdown.TIEBREAKER === 0 ? "0 3px 3px 0" : 0 }} />
      )}
      {breakdown.TIEBREAKER > 0 && (
        <span title={`Tie-breakers: ${breakdown.TIEBREAKER}`}
          style={{ flex: breakdown.TIEBREAKER, background: "var(--muted-2)", borderRadius: "0 3px 3px 0" }} />
      )}
    </div>
  );
}

// ─── Bracket (kept for prediction preview) ───────────────────────────────────

const SLOT_H = 50, MATCH_H = 44, MATCH_W = 150, R_GAP = 20, HEADER_H = 24;
function roundX(r: number) { return r * (MATCH_W + R_GAP); }
function matchCenterY(ri: number, mi: number, ts: number) { return (mi + 0.5) * (ts / (ts / Math.pow(2, ri))) * SLOT_H; }
function matchTopY(ri: number, mi: number, ts: number) { return matchCenterY(ri, mi, ts) - MATCH_H / 2; }

function BracketMatchCard({ homeTeam, awayTeam, winner, top, left }: {
  homeTeam: PredictionTeam | null | undefined; awayTeam: PredictionTeam | null | undefined;
  winner: string | undefined; top: number; left: number;
}) {
  const rowH = (MATCH_H - 2) / 2;
  function TeamRow({ team }: { team: PredictionTeam | null | undefined }) {
    const tid = team?.id ?? null;
    const isWinner = !!winner && winner === tid;
    const isLoser = !!winner && !!tid && winner !== tid;
    return (
      <div className="flex items-center gap-1.5 px-2" style={{
        height: rowH,
        background: isWinner ? "linear-gradient(90deg, var(--accent), var(--accent-strong))" : "transparent",
        color: isWinner ? "white" : isLoser ? "var(--muted)" : undefined,
        opacity: isLoser ? 0.55 : 1,
      }}>
        {team ? (<><span className="text-sm leading-none shrink-0">{flagEmoji(team.fifaCode)}</span><span className="text-xs font-semibold truncate">{team.name}</span></>) : <span className="text-xs muted">TBD</span>}
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", top: HEADER_H + top, left, width: MATCH_W, height: MATCH_H }} className="rounded-[0.7rem] overflow-hidden">
      <div className="h-full flex flex-col" style={{ border: "1px solid var(--border)", background: "var(--paper-strong)", borderRadius: "0.7rem", overflow: "hidden" }}>
        <TeamRow team={homeTeam} />
        <div style={{ height: 2, background: "var(--border)", flexShrink: 0 }} />
        <TeamRow team={awayTeam} />
      </div>
    </div>
  );
}

// ─── Prediction preview modal ─────────────────────────────────────────────────

function PredictionPreviewModal({ predictionId, onClose }: { predictionId: string; onClose: () => void }) {
  const locale = useLocale();
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    fetch(`/api/predictions/${predictionId}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [predictionId]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pred = data?.prediction, tournament = data?.tournament, matches = data?.matches ?? [];
  const allTeams = new Map<string, PredictionTeam>();
  for (const g of tournament?.groups ?? []) for (const { team } of g.teams) allTeams.set(team.id, team);

  const groupStandings = pred ? buildGroupStandingsMap(pred.groupStandings) : {};
  const knockoutPicks = pred ? buildKnockoutPicksMap(pred.entries) : {};
  const thirdPlaceRanking = pred
    ? pred.thirdPlaceRankings.length > 0 ? pred.thirdPlaceRankings.map(r => r.teamId)
      : inferThirdPlaceRanking(tournament?.groups ?? [], groupStandings, pred.entries)
    : [];
  const resolvedTeams = pred ? computeResolvedTeams(matches, tournament?.groups ?? [], groupStandings, thirdPlaceRanking, knockoutPicks) : {};
  const knockoutPhases = matches.map(m => m.phase).filter(p => p.isKnockout).filter((p, i, a) => a.findIndex(x => x.id === p.id) === i).sort((a, b) => a.sortOrder - b.sortOrder);
  const matchesByPhase: Record<string, PredictionMatch[]> = {};
  for (const m of matches) {
    if (!m.phase.isKnockout) continue;
    if (!matchesByPhase[m.phase.id]) matchesByPhase[m.phase.id] = [];
    matchesByPhase[m.phase.id].push(m);
  }
  for (const k of Object.keys(matchesByPhase)) matchesByPhase[k].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalSlots = knockoutPhases.length > 0 ? (matchesByPhase[knockoutPhases[0].id]?.length ?? 16) : 16;
  const bracketH = totalSlots * SLOT_H, bracketW = knockoutPhases.length * (MATCH_W + R_GAP) - R_GAP;
  const connectorPaths: string[] = [];
  for (let r = 0; r < knockoutPhases.length - 1; r++) {
    const rm = matchesByPhase[knockoutPhases[r].id] ?? [];
    for (let k = 0; k < Math.floor(rm.length / 2); k++) {
      const topY = matchCenterY(r, 2 * k, totalSlots), botY = matchCenterY(r, 2 * k + 1, totalSlots), nextY = matchCenterY(r + 1, k, totalSlots);
      const x1 = roundX(r) + MATCH_W, x2 = roundX(r + 1), xMid = x1 + (x2 - x1) * 0.45;
      connectorPaths.push(`M ${x1} ${topY} H ${xMid} V ${botY} M ${x1} ${botY} H ${xMid}`);
      connectorPaths.push(`M ${xMid} ${nextY} H ${x2}`);
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-10"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="surface relative w-full max-w-5xl rounded-[var(--r-xl)] p-6 md:p-8 my-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Prediction preview</p>
            <h3 className="headline mt-2" style={{ fontSize: 26 }}>{pred?.name ?? "Loading…"}</h3>
            {pred?.description && <p className="text-sm muted mt-1">{pred.description}</p>}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
        </div>
        {loading && <p className="muted" style={{ fontSize: 13 }}>Loading prediction…</p>}
        {!loading && pred && (
          <div className="space-y-8">
            <div>
              <p className="eyebrow mb-3">Group standings</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {(tournament?.groups ?? []).map(group => {
                  const standing = groupStandings[group.id] ?? [];
                  return (
                    <div key={group.id} className="surface-quiet rounded-[var(--r-md)] p-3">
                      <p className="eyebrow eyebrow-accent mb-2">Group {group.name}</p>
                      <ol className="space-y-1">
                        {standing.map((teamId, i) => {
                          const t = allTeams.get(teamId);
                          return (
                            <li key={teamId} className="flex items-center gap-1.5" style={{ fontSize: 12 }}>
                              <span className="muted w-3">{i + 1}.</span>
                              <span>{t ? flagEmoji(t.fifaCode) : ""}</span>
                              <span className="truncate font-semibold">{t?.name ?? "?"}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </div>
            {thirdPlaceRanking.length > 0 && (
              <div>
                <p className="eyebrow mb-3">Best third-place (top 8 qualify)</p>
                <div className="flex flex-wrap gap-2">
                  {thirdPlaceRanking.map((teamId, i) => {
                    const t = allTeams.get(teamId);
                    return (
                      <span key={teamId} className={`chip ${i < 8 ? "chip-accent" : ""}`}>
                        {i + 1}. {t ? `${flagEmoji(t.fifaCode)} ${t.name}` : "?"}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {knockoutPhases.length > 0 && (
              <div>
                <p className="eyebrow mb-3">Knockout bracket</p>
                <div className="overflow-x-auto">
                  <div style={{ position: "relative", width: bracketW, height: HEADER_H + bracketH, minWidth: bracketW }}>
                    {knockoutPhases.map((phase, r) => (
                      <div key={phase.id} style={{ position: "absolute", left: roundX(r), top: 0, width: MATCH_W, height: HEADER_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="eyebrow" style={{ fontSize: 9 }}>{phase.name}</span>
                      </div>
                    ))}
                    <svg style={{ position: "absolute", top: HEADER_H, left: 0, width: bracketW, height: bracketH, overflow: "visible", pointerEvents: "none" }}>
                      {connectorPaths.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--border-strong)" strokeWidth="1.5" strokeLinecap="round" />)}
                    </svg>
                    {knockoutPhases.map((phase, r) => (matchesByPhase[phase.id] ?? []).map((match, i) => {
                      const resolved = resolvedTeams[match.id];
                      return (
                        <BracketMatchCard key={match.id}
                          homeTeam={resolved?.home ? allTeams.get(resolved.home) : undefined}
                          awayTeam={resolved?.away ? allTeams.get(resolved.away) : undefined}
                          winner={knockoutPicks[match.id]}
                          top={matchTopY(r, i, totalSlots)} left={roundX(r)} />
                      );
                    }))}
                  </div>
                </div>
              </div>
            )}
            {pred.tieBreakerAnswers.length > 0 && (
              <div>
                <p className="eyebrow mb-3">Tie-breakers</p>
                <div className="space-y-2">
                  {pred.tieBreakerAnswers.map(a => {
                    const q = tournament?.tieBreakers.find(tb => tb.id === a.questionId);
                    return (
                      <div key={a.questionId} className="flex items-center justify-between gap-4 rounded-[var(--r-md)] border px-4 py-2.5" style={{ borderColor: "var(--border)", fontSize: 13 }}>
                        <span className="muted">{q ? (q.prompt[locale] ?? q.prompt["en"] ?? Object.values(q.prompt)[0] ?? a.questionId) : a.questionId}</span>
                        <span className="font-bold mono">{a.answer}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <Link href={`/dashboard/predictions/${pred.id}`} className="text-sm muted underline">View full prediction →</Link>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Group room page ──────────────────────────────────────────────────────────

export default function GroupDetailPage() {
  const params = useParams() as { groupId: string };
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations("groups.groupRoom");

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [myPredictions, setMyPredictions] = useState<UserPrediction[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [changingSubmission, setChangingSubmission] = useState(false);
  const [newPredictionId, setNewPredictionId] = useState("");
  const [updatingSubmission, setUpdatingSubmission] = useState(false);

  const currentUserEmail = session?.user?.email;
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  const mySubmission = group?.submissions.find(s => s.user.email === currentUserEmail || s.user.id === currentUserId);
  const isOwner = group?.ownerId === currentUserId || group?.owner.email === currentUserEmail;

  const myRankIdx = leaderboard.findIndex(r => r.userId === currentUserId || leaderboard.find(x => x.userName === (session?.user?.name ?? session?.user?.email)));
  const myRow = currentUserId ? leaderboard.find(r => r.userId === currentUserId) : undefined;
  const myRank = myRow ? leaderboard.indexOf(myRow) + 1 : null;
  const leaderPoints = leaderboard[0]?.points ?? 0;
  const myPoints = myRow?.points ?? 0;
  const gap = myRow ? myPoints - leaderPoints : null;

  const deadline = group?.tournament?.submissionDeadline ? new Date(group.tournament.submissionDeadline) : null;
  const deadlinePassed = deadline ? new Date() > deadline : false;
  const deadlineSoon = !deadlinePassed && deadline ? deadline.getTime() - Date.now() < 48 * 60 * 60 * 1000 : false;

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

  useEffect(() => { void loadGroup(); void loadMyPredictions(); }, [params.groupId]);

  async function submitPrediction(predictionId: string) {
    setError(""); setSuccess(""); setSubmitting(predictionId);
    const res = await fetch(`/api/groups/${params.groupId}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predictionId }),
    });
    setSubmitting(null);
    if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.error ?? "Submit failed."); return; }
    setSuccess(t("predictionSubmitted"));
    await loadGroup();
  }

  async function updateSubmission() {
    if (!newPredictionId) return;
    setError(""); setSuccess(""); setUpdatingSubmission(true);
    const res = await fetch(`/api/groups/${params.groupId}/submit`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predictionId: newPredictionId }),
    });
    setUpdatingSubmission(false);
    if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.error ?? "Could not update submission."); return; }
    setSuccess(t("submissionUpdated"));
    setChangingSubmission(false); setNewPredictionId("");
    await loadGroup();
  }

  async function leaveGroup() {
    setError(""); setLeaving(true);
    const res = await fetch(`/api/groups/${params.groupId}/membership`, { method: "DELETE" });
    setLeaving(false);
    if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.error ?? "Could not leave group."); setConfirmLeave(false); return; }
    router.push("/dashboard/groups");
  }

  function copyInviteLink() {
    if (!group?.inviteCode) return;
    const base = window.location.href.split("/dashboard")[0];
    void navigator.clipboard.writeText(`${base}/dashboard/groups?code=${group.inviteCode}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  const memberCount = group?.memberships.length ?? 0;
  const otherPredictions = myPredictions.filter(p => p.id !== mySubmission?.prediction.id);

  return (
    <>
      {previewId && <PredictionPreviewModal predictionId={previewId} onClose={() => setPreviewId(null)} />}

      {/* Bleed wrapper — cancels the dashboard <main> padding */}
      <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-5">

        {/* ── Group header ─────────────────────────────────────────── */}
        <div style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)", padding: "20px 24px 16px" }}>
          {/* Top row: back + actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Link href="/dashboard/groups" className="btn btn-sm btn-ghost">{t("backToDashboard")}</Link>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" onClick={copyInviteLink}>
                {copiedLink ? t("copied") : t("invite")}
              </button>
              {!isOwner && group && (
                confirmLeave ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("leaveConfirm")}</span>
                    <button className="btn btn-sm" style={{ background: "var(--live)", color: "#fff", borderColor: "var(--live)" }} onClick={() => void leaveGroup()} disabled={leaving}>
                      {leaving ? "…" : t("leaveYes")}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setConfirmLeave(false)}>{t("leaveNo")}</button>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-ghost" style={{ color: "var(--live)" }} onClick={() => setConfirmLeave(true)}>{t("leaveButton")}</button>
                )
              )}
            </div>
          </div>

          {/* Title row + KPI strip */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: 6 }}>
                {group ? `GROUP · ${memberCount} ${memberCount !== 1 ? t("members") : t("member")} · INVITE ${group.inviteCode}` : t("groupRoom")}
              </p>
              <h1 className="display" style={{ fontSize: 38, margin: 0, color: "var(--ink)" }}>
                {group?.name ?? t("loading")}
              </h1>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                {group ? t("createdBy", { name: displayName(group.owner) }) : "—"}
                {group?.tournament?.name && ` · ${group.tournament.name}`}
                {deadline && (
                  <span style={{ marginLeft: 8, color: deadlinePassed ? "var(--live)" : deadlineSoon ? "#b45309" : "var(--accent-strong)", fontWeight: 600 }}>
                    · {deadlinePassed ? t("deadlineClosed") : t("deadlineLabel", { date: deadline.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) })}
                  </span>
                )}
              </p>
            </div>

            {/* KPI strip */}
            {myRow && (
              <div style={{ display: "flex", gap: 28, alignItems: "flex-end", flexShrink: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span className="eyebrow">{t("youLabel")}</span>
                  <span className="display tabnum" style={{ fontSize: 32, lineHeight: 1 }}>
                    #{myRank} <span className="muted-2" style={{ fontSize: 18, fontWeight: 600 }}>/{memberCount}</span>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span className="eyebrow">{t("yourPoints")}</span>
                  <span className="display tabnum" style={{ fontSize: 32, lineHeight: 1 }}>
                    <CountUp value={myPoints} />
                  </span>
                </div>
                {myRank !== 1 && gap !== null && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span className="eyebrow">{t("gapTo1")}</span>
                    <span className="display tabnum" style={{ fontSize: 32, lineHeight: 1, color: "var(--live)" }}>
                      −{Math.abs(gap)}
                    </span>
                  </div>
                )}
                {myRank === 1 && leaderboard.length > 1 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span className="eyebrow">{t("lead")}</span>
                    <span className="display tabnum" style={{ fontSize: 32, lineHeight: 1, color: "var(--accent-strong)" }}>
                      +{myPoints - (leaderboard[1]?.points ?? 0)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Staged tournament CTA ─────────────────────────────────── */}
        {group?.tournament?.type === "STAGED" && group.tournament.id && (
          <div style={{
            position: "sticky", top: 64, zIndex: 20,
            background: "var(--accent-soft, #e0f2fe)",
            borderBottom: "1px solid var(--accent, #0ea5e9)",
            padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent-strong, #0284c7)", flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>
                <strong>Staged predictions are open.</strong>{" "}
                <span style={{ color: "var(--muted)" }}>Pick your qualifying teams and match winners stage by stage.</span>
              </span>
            </div>
            <Link
              href={`/dashboard/groups/${params.groupId}/predictions/${group.tournament.id}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "var(--accent-strong, #0284c7)", color: "#fff",
                borderRadius: 999, padding: "7px 18px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", textDecoration: "none",
              }}
            >
              Make Predictions →
            </Link>
          </div>
        )}

        {/* ── Sticky submission bar ─────────────────────────────────── */}
        {group?.tournament?.type !== "STAGED" && (mySubmission || (!mySubmission && !deadlinePassed && myPredictions.length > 0)) && (
          <div style={{
            position: "sticky", top: 64, zIndex: 20,
            background: mySubmission ? "var(--accent-soft)" : "var(--gold-soft)",
            borderBottom: `1px solid ${mySubmission ? "var(--accent)" : "var(--gold)"}`,
            padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: mySubmission ? "var(--accent-strong)" : "var(--gold)", flexShrink: 0 }} />
              {mySubmission ? (
                <span style={{ fontSize: 13 }}>
                  <strong>{t("submittedBar")}</strong>{" "}
                  <span style={{ color: "var(--accent-ink)" }}>&ldquo;{mySubmission.prediction.name}&rdquo;</span>
                  {myRow && <span className="muted" style={{ marginLeft: 6 }}>· {myPoints} pts</span>}
                </span>
              ) : (
                <span style={{ fontSize: 13, color: "var(--gold)", fontWeight: 600 }}>
                  {t("notSubmittedYet")}
                </span>
              )}
            </div>
            {mySubmission && !deadlinePassed && (
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="btn btn-sm" onClick={() => setPreviewId(mySubmission.prediction.id)}>{t("previewButton")}</button>
                <button className="btn btn-sm btn-primary" onClick={() => { setChangingSubmission(p => !p); setNewPredictionId(""); }}>
                  {changingSubmission ? t("cancelSwap") : t("swapSelection")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Breakdown legend ──────────────────────────────────────── */}
        <div style={{ background: "var(--paper-strong)", borderBottom: "1px solid var(--border)", padding: "7px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span className="eyebrow" style={{ color: "var(--muted-2)" }}>{t("breakdownLabel")}</span>
          {[
            { color: "var(--accent-strong)", label: t("matchPts") },
            { color: "#86efac",              label: t("standings2") },
            { color: "var(--gold)",          label: t("knockout5") },
            { color: "var(--muted-2)",       label: t("tieBreakersPts") },
          ].map(l => (
            <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, flexShrink: 0 }} />
              <span className="mono" style={{ fontSize: 11, letterSpacing: "0.06em" }}>{l.label}</span>
            </span>
          ))}
        </div>

        {/* ── Error / success banners ───────────────────────────────── */}
        {error && (
          <div style={{ padding: "10px 24px", background: "var(--live-soft)", borderBottom: "1px solid var(--live)", color: "var(--live)", fontSize: 13, fontWeight: 600 }}>{error}</div>
        )}
        {success && (
          <div style={{ padding: "10px 24px", background: "var(--accent-soft)", borderBottom: "1px solid var(--accent)", color: "var(--accent-ink)", fontSize: 13, fontWeight: 600 }}>{success}</div>
        )}

        {/* ── Body: 2-col on desktop, stacked on mobile ─────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", minHeight: 400 }} className="lg:grid-cols-[2fr_1fr]">

          {/* ── Left: Leaderboard ──────────────────────────────────── */}
          <div style={{ overflowX: "auto" }}>
            {leaderboard.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("noSubmissionsYet")}</p>
              </div>
            ) : (
              <table className="tabular" style={{ width: "100%" }}>
                <thead style={{ position: "sticky", top: 104, zIndex: 10 }}>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th>{t("memberHeader")}</th>
                    <th>{t("setHeader")}</th>
                    <th style={{ minWidth: 160 }}>{t("breakdownHeader")}</th>
                    <th style={{ textAlign: "right", width: 60 }}>{t("ptsHeader")}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => {
                    const isMe = row.userId === currentUserId;
                    const rank = idx + 1;
                    return (
                      <tr
                        key={row.userId}
                        style={{
                          background: isMe ? "var(--accent-soft)" : "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => setPreviewId(row.predictionId)}
                      >
                        {/* Rank */}
                        <td>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <MedalBadge rank={rank} />
                          </span>
                        </td>
                        {/* Member */}
                        <td>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Avatar userId={row.userId} name={row.userName} size={24} />
                            <span style={{ fontWeight: 600, fontSize: 13 }}>
                              {row.userName}
                              {isMe && <span className="chip chip-accent" style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px" }}>{t("youLabel")}</span>}
                            </span>
                          </span>
                        </td>
                        {/* Set name */}
                        <td style={{ color: "var(--muted)", fontSize: 12, maxWidth: 160 }}>
                          <span className="truncate" style={{ display: "block" }}>&ldquo;{row.predictionName}&rdquo;</span>
                        </td>
                        {/* Breakdown bar */}
                        <td>
                          <BreakdownBar breakdown={row.breakdown} />
                          <div className="mono muted" style={{ fontSize: 10, marginTop: 3, letterSpacing: "0.04em" }}>
                            M·{row.breakdown.MATCH} S·{row.breakdown.GROUP_STANDING} K·{row.breakdown.KNOCKOUT} T·{row.breakdown.TIEBREAKER}
                          </div>
                        </td>
                        {/* Total */}
                        <td style={{ textAlign: "right" }}>
                          <span className="mono" style={{ fontSize: 16, fontWeight: 800, color: isMe ? "var(--accent-strong)" : "var(--ink)" }}>
                            <CountUp value={row.points} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Right rail ─────────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--paper-strong)", display: "flex", flexDirection: "column" }} className="lg:border-t-0 lg:border-l">

            {/* Your drafts */}
            <div style={{ padding: "20px", borderBottom: "1px solid var(--border)" }}>
              <p className="eyebrow" style={{ marginBottom: 12 }}>{t("yourPredictions")}</p>

              {/* Not submitted + deadline passed */}
              {!mySubmission && deadlinePassed && (
                <div style={{ padding: 12, background: "var(--live-soft)", borderRadius: "var(--r-sm)", border: "1px solid var(--live)" }}>
                  <p style={{ fontSize: 12, color: "var(--live)", fontWeight: 600 }}>{t("submissionsClosed")}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{t("deadlinePassed")}</p>
                </div>
              )}

              {/* No predictions and not submitted */}
              {!mySubmission && !deadlinePassed && myPredictions.length === 0 && (
                <div style={{ padding: 12, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", textAlign: "center" }}>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{t("noPredictionsYet")}</p>
                  <Link href="/dashboard/predictions" className="btn btn-sm btn-accent">{t("createOne")}</Link>
                </div>
              )}

              {/* Submitted prediction card */}
              {mySubmission && (
                <div style={{
                  padding: 12, borderRadius: "var(--r-sm)", marginBottom: 8,
                  background: "var(--paper)",
                  border: `2px solid ${changingSubmission ? "var(--border)" : "var(--accent)"}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>&ldquo;{mySubmission.prediction.name}&rdquo;</span>
                    <span className="chip chip-accent" style={{ fontSize: 10, padding: "2px 7px" }}>{t("activeBadge")}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                    {t("submittedPts", { pts: myPoints })}
                  </p>
                </div>
              )}

              {/* Swap mode: other predictions */}
              {(changingSubmission || !mySubmission) && !deadlinePassed && myPredictions.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {myPredictions
                    .filter(p => p.id !== mySubmission?.prediction.id)
                    .map(p => {
                      const isSelected = newPredictionId === p.id;
                      return (
                        <div key={p.id} style={{
                          padding: 10, borderRadius: "var(--r-sm)",
                          border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                          background: isSelected ? "var(--accent-soft)" : "var(--paper)",
                        }}>
                          <p style={{ fontWeight: 600, fontSize: 12 }}>&ldquo;{p.name}&rdquo;</p>
                          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <button className="btn btn-sm" style={{ flex: 1, justifyContent: "center", fontSize: 11 }} onClick={() => setPreviewId(p.id)}>{t("previewButton")}</button>
                            {mySubmission ? (
                              <button className="btn btn-sm" style={{ flex: 1, justifyContent: "center", fontSize: 11, background: isSelected ? "var(--accent-strong)" : undefined, color: isSelected ? "#fff" : undefined, borderColor: isSelected ? "var(--accent-strong)" : undefined }}
                                onClick={() => setNewPredictionId(prev => prev === p.id ? "" : p.id)}>
                                {isSelected ? t("selectedButton") : t("selectButton")}
                              </button>
                            ) : (
                              <button className="btn btn-sm btn-accent" style={{ flex: 1, justifyContent: "center", fontSize: 11, opacity: submitting === p.id ? 0.7 : 1 }}
                                disabled={submitting !== null} onClick={() => void submitPrediction(p.id)}>
                                {submitting === p.id ? "…" : t("submitButton")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {/* Confirm swap button */}
                  {changingSubmission && newPredictionId && (
                    <button className="btn btn-accent" style={{ marginTop: 4, justifyContent: "center", fontSize: 13 }}
                      onClick={() => void updateSubmission()} disabled={updatingSubmission}>
                      {updatingSubmission ? t("updatingSwap") : t("confirmSwap")}
                    </button>
                  )}
                </div>
              )}

              <Link href="/dashboard/predictions" className="btn btn-sm btn-ghost" style={{ marginTop: 10, width: "100%", justifyContent: "center", fontSize: 12 }}>
                {t("newPrediction")}
              </Link>
            </div>

            {/* Just happened */}
            <div style={{ padding: "20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p className="eyebrow">{t("justHappened")}</p>
                <span className="live-dot" />
              </div>
              {leaderboard.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--muted)" }}>{t("noActivity")}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {leaderboard.slice(0, 5).map((row, i) => (
                    <div key={row.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: i < 4 ? "1px dashed var(--border)" : "none" }}>
                      <Avatar userId={row.userId} name={row.userName} size={18} />
                      <span style={{ flex: 1, fontSize: 12 }}>
                        <strong>{row.userName.split(" ")[0]}</strong>
                        <span className="muted"> · {row.points} pts</span>
                      </span>
                      <span className="mono muted" style={{ fontSize: 11 }}>#{i + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Members */}
            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <p className="eyebrow">{t("membersCount", { count: memberCount })}</p>
                <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={copyInviteLink}>
                  {t("inviteButton")}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(group?.memberships ?? []).map(m => (
                  <Avatar key={m.user.id} userId={m.user.id} name={displayName(m.user)} size={28} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Mobile bottom spacing (offsets bottom nav) ─────────────── */}
        <div className="h-28 lg:h-0" />
      </div>
    </>
  );
}
