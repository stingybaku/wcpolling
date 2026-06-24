"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import { TeamFlag } from "@/components/team-flag";
import { GroupNews } from "@/components/group-news";
import { upgradeOptionsFor, type MemberTier } from "@/lib/group-limits";
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
  memberCap: number;
  tournament?: { id: string; name: string; type: string; submissionDeadline?: string | null; finalizedAt?: string | null } | null;
  owner: { email?: string | null; name?: string | null };
  memberships: Array<{ userId: string; role: string; isActive: boolean; user: { id: string; email?: string | null; name?: string | null; image?: string | null } }>;
  submissions: Array<{
    id: string;
    user: { id: string; email?: string | null; name?: string | null; image?: string | null };
    prediction: { id: string; name: string };
    scores: Array<{ points: number; scoreType: "MATCH" | "GROUP_STANDING" | "KNOCKOUT" | "TIEBREAKER"; label?: string | null }>;
  }>;
};

type UserPrediction = { id: string; name: string };

type StagedLeaderboardEntry = {
  userId: string;
  userName: string | null;
  userImage: string | null;
  totalPoints: number;
  totalCorrectPicks: number;
  badges: { slug: string; icon: string | null }[];
  stages: { stageId: string; stageName: string; stageStatus: string; points: number; correctPicks: number }[];
};

type StagedStage = { id: string; name: string; status: string; closesAt?: string };

type LeaderboardRow = {
  userId: string;
  userName: string;
  userImage: string | null;
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
        userImage: sub.user.image ?? null,
        predictionId: sub.prediction.id,
        predictionName: sub.prediction.name,
        points: sub.scores.reduce((sum, s) => sum + s.points, 0),
        breakdown,
      };
    })
    .sort((a, b) => b.points - a.points);
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Avatar({ userId, name, size = 24, image }: { userId: string; name: string; size?: number; image?: string | null }) {
  const color = memberColor(userId);
  const label = initials(name);
  const [broken, setBroken] = useState(false);

  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        title={name}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0, display: "inline-block", background: color }}
      />
    );
  }

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

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function paginate<T>(rows: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clamped = Math.min(Math.max(1, page), pageCount);
  const start = (clamped - 1) * PAGE_SIZE;
  return { pageCount, page: clamped, start, pageRows: rows.slice(start, start + PAGE_SIZE) };
}

function Paginator({ page, pageCount, total, totalLabel, prevLabel, nextLabel, onPage }: {
  page: number; pageCount: number; total: number; totalLabel: string;
  prevLabel: string; nextLabel: string; onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 24px", borderTop: "1px solid var(--border)" }}>
      <span className="muted" style={{ fontSize: 12 }}>{total} {totalLabel}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ {prevLabel}</button>
        <span className="mono" style={{ fontSize: 12, minWidth: 56, textAlign: "center" }}>{page} / {pageCount}</span>
        <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>{nextLabel} ›</button>
      </div>
    </div>
  );
}

function MyRankStrip({ rank, name, points, youLabel, jumpLabel, onJump }: {
  rank: number; name: string; points: number; youLabel: string; jumpLabel: string; onJump: () => void;
}) {
  return (
    <button
      onClick={onJump}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 24px",
        background: "var(--accent-soft)", border: "none", borderTop: "1px dashed var(--accent)",
        cursor: "pointer", textAlign: "left",
      }}
    >
      <span className="mono" style={{ fontWeight: 800, color: "var(--accent-strong)", fontSize: 13, minWidth: 28 }}>#{rank}</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name} <span className="chip chip-accent" style={{ fontSize: 10, padding: "2px 6px" }}>{youLabel}</span>
      </span>
      <span className="mono" style={{ fontWeight: 800, fontSize: 14 }}>{points}</span>
      <span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{jumpLabel}</span>
    </button>
  );
}

// ─── Member management ───────────────────────────────────────────────────────

type Member = GroupDetail["memberships"][number];
type MemberSubInfo = { submittedAt: string | null; unlockedAt: string | null; unlocksRemaining: number };

function memberBadgeStyle(color: string, bg: string): CSSProperties {
  return {
    fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
    color, background: bg, borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
  };
}

function memberActionStyle(color: string, border: string): CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
    color, background: "transparent", border: `1px solid ${border}`, borderRadius: 5,
    padding: "4px 8px", cursor: "pointer", whiteSpace: "nowrap",
  };
}

type MemberItemProps = {
  variant: "card" | "row";
  zebra?: boolean;
  m: Member;
  ownerId: string | undefined;
  currentUserId: string | undefined;
  sub: MemberSubInfo | undefined;
  openStageId: string | null;
  groupId: string;
  onChanged: () => void;
  onUnlock: (userId: string, stageId: string) => void;
  onAudit?: (userId: string) => void;
  isStaged: boolean;
  isPortalAdmin: boolean;
  openStageClosesAt: string | null;
};

function MemberItem({ variant, zebra, m, ownerId, currentUserId, sub, openStageId, groupId, onChanged, onUnlock, onAudit, isStaged, isPortalAdmin, openStageClosesAt }: MemberItemProps) {
  const t = useTranslations("groups.groupRoom");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const name = displayName(m.user);
  const isOwner = m.userId === ownerId;
  const isAdmin = isOwner || m.role === "GROUP_ADMIN";
  const isMe = m.userId === currentUserId;
  const isCurrentUserOwner = ownerId === currentUserId;
  const canManage = !isMe && !isOwner; // section is rendered for group admins only
  const hasLockedSubmission = !!(openStageId && sub?.submittedAt);
  const remaining = sub?.unlocksRemaining ?? 0;

  async function updateMember(body: { role?: string; isActive?: boolean }) {
    await fetch(`/api/groups/${groupId}/members/${m.userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged();
  }

  type Act = { key: string; label: string; color: string; border: string; onClick: () => void };
  const actions: Act[] = [];
  // Audit is a read-only inspection tool, available for any member of a staged
  // group (the section already only renders for group/portal admins).
  if (isStaged && onAudit) actions.push({ key: "audit", label: t("audit.button"), color: "var(--accent-strong)", border: "var(--accent)", onClick: () => onAudit(m.userId) });
  if (canManage && !m.isActive) actions.push({ key: "activate", label: t("activateButton"), color: "#16a34a", border: "#86efac", onClick: () => void updateMember({ isActive: true }) });
  if (canManage && m.isActive && !isAdmin) actions.push({ key: "deactivate", label: t("deactivateButton"), color: "var(--live)", border: "var(--live)", onClick: () => void updateMember({ isActive: false }) });
  if (canManage && m.isActive && !isAdmin) actions.push({ key: "promote", label: t("promoteButton"), color: "var(--muted-2)", border: "var(--border)", onClick: () => void updateMember({ role: "GROUP_ADMIN" }) });
  if (isCurrentUserOwner && isAdmin && !isOwner && !isMe) actions.push({ key: "demote", label: t("demoteButton"), color: "var(--muted)", border: "var(--border)", onClick: () => void updateMember({ role: "MEMBER" }) });
  if (!isMe && hasLockedSubmission && openStageId && (remaining > 0 || isPortalAdmin)) actions.push({ key: "unlock", label: t("unlockButton"), color: "var(--accent-strong)", border: "var(--accent)", onClick: () => onUnlock(m.userId, openStageId) });

  const roleBadge = isOwner
    ? <span style={memberBadgeStyle("var(--accent-strong)", "var(--accent-soft)")}>{t("ownerBadge")}</span>
    : isAdmin
      ? <span style={memberBadgeStyle("var(--muted)", "var(--bg-strong)")}>{t("adminBadge")}</span>
      : null;
  const inactiveBadge = !m.isActive && !isOwner
    ? <span style={memberBadgeStyle("var(--muted-2)", "var(--bg-strong)")}>{t("inactiveBadge")}</span>
    : null;
  const unlocksLabel = hasLockedSubmission ? (
    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: remaining > 0 ? "var(--muted)" : "var(--muted-2)", whiteSpace: "nowrap" }}>
      {t("unlocksRemaining", { count: remaining })}
    </span>
  ) : null;

  // Per-member submission state for the open stage: can they still edit, are they
  // locked (submitted), or has the deadline passed?
  // eslint-disable-next-line react-hooks/purity -- deadline is inherently time-relative
  const deadlinePassed = !!(openStageClosesAt && Date.now() >= new Date(openStageClosesAt).getTime());
  const statusBadge = openStageId ? (
    deadlinePassed
      ? <span style={memberBadgeStyle("var(--muted-2)", "var(--bg-strong)")}>{t("statusDeadlinePassed")}</span>
      : sub?.submittedAt
        ? <span style={memberBadgeStyle("var(--gold)", "var(--gold-soft)")}>{t("statusLocked")}</span>
        : <span style={memberBadgeStyle("var(--accent-strong)", "var(--accent-soft)")}>{t("statusOpenToEdit")}</span>
  ) : null;

  // Desktop: full card with inline action buttons.
  if (variant === "card") {
    return (
      <div style={{
        border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--paper)",
        padding: 12, display: "flex", flexDirection: "column", gap: 10,
        opacity: m.isActive || isOwner ? 1 : 0.72,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar userId={m.user.id} name={name} image={m.user.image} size={44} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: m.isActive || isOwner ? "var(--ink)" : "var(--muted)" }}>
              {name}{isMe && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {t("youLabel")}</span>}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
              {roleBadge}{inactiveBadge}{statusBadge}{unlocksLabel}
            </div>
          </div>
        </div>
        {actions.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {actions.map((a) => (
              <button key={a.key} onClick={a.onClick} style={memberActionStyle(a.color, a.border)}>{a.label}</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Mobile: compact row, actions collapsed under a ⋯ dropdown.
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px", borderRadius: 6, background: zebra ? "var(--bg-strong)" : "transparent" }}>
      <Avatar userId={m.user.id} name={name} image={m.user.image} size={34} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: m.isActive || isOwner ? "var(--ink)" : "var(--muted)" }}>
        {name}{isMe && <span style={{ color: "var(--muted)", fontWeight: 400 }}> {t("youLabel")}</span>}
      </span>
      {inactiveBadge}{roleBadge}{statusBadge}{unlocksLabel}
      {actions.length > 0 && (
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            aria-label={t("memberActions")} aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--muted)", padding: "2px 8px", fontSize: 16, lineHeight: 1 }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 30, background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: 4, minWidth: 170, display: "flex", flexDirection: "column", gap: 2 }}>
              {actions.map((a) => (
                <button
                  key={a.key} role="menuitem"
                  onClick={() => { setMenuOpen(false); a.onClick(); }}
                  style={{ textAlign: "left", background: "transparent", border: "none", borderRadius: 5, cursor: "pointer", padding: "8px 10px", fontSize: 12, fontWeight: 600, color: a.color }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type MemberManagerProps = {
  groupId: string;
  memberships: Member[];
  ownerId: string | undefined;
  currentUserId: string | undefined;
  memberSubmissions: Record<string, MemberSubInfo>;
  openStageId: string | null;
  memberCount: number;
  memberCap: number;
  upgrading: boolean;
  onUpgrade: (cap: number) => void;
  onChanged: () => void;
  onUnlock: (userId: string, stageId: string) => void;
  onAudit?: (userId: string) => void;
  isStaged: boolean;
  onInvite: () => void;
  isPortalAdmin: boolean;
  openStageClosesAt: string | null;
};

type StatusFilter = "all" | "active" | "inactive";
type PicksFilter = "all" | "submitted" | "pending";

function filterChipStyle(active: boolean): CSSProperties {
  return {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
    padding: "5px 10px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-soft)" : "transparent",
    color: active ? "var(--accent-strong)" : "var(--muted)",
  };
}

function MemberManager({ groupId, memberships, ownerId, currentUserId, memberSubmissions, openStageId, memberCount, memberCap, upgrading, onUpgrade, onChanged, onUnlock, onAudit, isStaged, onInvite, isPortalAdmin, openStageClosesAt }: MemberManagerProps) {
  const t = useTranslations("groups.groupRoom");
  const upgradeOptions = upgradeOptionsFor(memberCap);
  const atCapacity = memberCount >= memberCap;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [picksFilter, setPicksFilter] = useState<PicksFilter>("all");

  const q = query.trim().toLowerCase();
  const filtered = memberships.filter((m) => {
    const activeEff = m.isActive || m.userId === ownerId;
    if (statusFilter === "active" && !activeEff) return false;
    if (statusFilter === "inactive" && activeEff) return false;
    if (openStageId && picksFilter !== "all") {
      const submitted = !!memberSubmissions[m.userId]?.submittedAt;
      if (picksFilter === "submitted" && !submitted) return false;
      if (picksFilter === "pending" && submitted) return false;
    }
    if (q && !displayName(m.user).toLowerCase().includes(q)) return false;
    return true;
  });

  const statusOptions: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: t("filterAll") },
    { value: "active", label: t("filterActive") },
    { value: "inactive", label: t("filterInactive") },
  ];
  const picksOptions: Array<{ value: PicksFilter; label: string }> = [
    { value: "all", label: t("filterAll") },
    { value: "submitted", label: t("filterSubmitted") },
    { value: "pending", label: t("filterNotSubmitted") },
  ];

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--paper-strong)", padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: open ? 16 : 0 }}>
        <button
          onClick={() => setOpen((v) => !v)} aria-expanded={open}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--ink)" }}
        >
          <span className="eyebrow">{t("membersCount", { count: memberCount })}</span>
          <span aria-hidden style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>▾</span>
        </button>
        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={onInvite}>{t("inviteButton")}</button>
      </div>

      {/* Capacity + paid upgrade options (group admins only — this whole panel is) */}
      <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: "var(--paper)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>{t("capacityLabel")}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: atCapacity ? "var(--danger, #ef4444)" : "var(--ink)" }}>
            {memberCount} / {memberCap}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "var(--border)", overflow: "hidden", margin: "8px 0 4px" }}>
          <div style={{ height: "100%", width: `${Math.min(100, Math.round((memberCount / memberCap) * 100))}%`, background: atCapacity ? "var(--danger, #ef4444)" : "var(--accent)" }} />
        </div>
        {upgradeOptions.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>{t("upgradeHint")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {upgradeOptions.map((tier: MemberTier) => (
                <button
                  key={tier.cap}
                  type="button"
                  className="btn btn-sm"
                  disabled={upgrading}
                  onClick={() => onUpgrade(tier.cap)}
                  style={{ fontSize: 12 }}
                >
                  {t("upgradeOption", { cap: tier.cap, price: (tier.priceCents / 100).toFixed(0) })}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {open && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 14 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="field"
              style={{ fontSize: 12, padding: "6px 12px", maxWidth: 220, height: "auto" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span className="eyebrow" style={{ fontSize: 9 }}>{t("filterStatus")}</span>
              {statusOptions.map((o) => (
                <button key={o.value} type="button" onClick={() => setStatusFilter(o.value)} style={filterChipStyle(statusFilter === o.value)}>{o.label}</button>
              ))}
            </div>
            {openStageId && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span className="eyebrow" style={{ fontSize: 9 }}>{t("filterPicks")}</span>
                {picksOptions.map((o) => (
                  <button key={o.value} type="button" onClick={() => setPicksFilter(o.value)} style={filterChipStyle(picksFilter === o.value)}>{o.label}</button>
                ))}
              </div>
            )}
            {filtered.length !== memberships.length && (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{t("showingCount", { shown: filtered.length, total: memberships.length })}</span>
            )}
          </div>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>{t("noMembersMatch")}</p>
          ) : (
            <>
              <div className="hidden md:grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {filtered.map((m) => (
                  <MemberItem key={m.user.id} variant="card" m={m} ownerId={ownerId} currentUserId={currentUserId}
                    sub={memberSubmissions[m.userId]} openStageId={openStageId} groupId={groupId} onChanged={onChanged} onUnlock={onUnlock} onAudit={onAudit} isStaged={isStaged} isPortalAdmin={isPortalAdmin} openStageClosesAt={openStageClosesAt} />
                ))}
              </div>
              <div className="flex flex-col md:hidden" style={{ gap: 4 }}>
                {filtered.map((m, mi) => (
                  <MemberItem key={m.user.id} variant="row" zebra={mi % 2 === 1} m={m} ownerId={ownerId} currentUserId={currentUserId}
                    sub={memberSubmissions[m.userId]} openStageId={openStageId} groupId={groupId} onChanged={onChanged} onUnlock={onUnlock} onAudit={onAudit} isStaged={isStaged} isPortalAdmin={isPortalAdmin} openStageClosesAt={openStageClosesAt} />
                ))}
              </div>
            </>
          )}
        </>
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
        {team ? (<><TeamFlag code={team.fifaCode} size={16} /><span className="text-xs font-semibold truncate">{team.name}</span></>) : <span className="text-xs muted">TBD</span>}
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
                              {t ? <TeamFlag code={t.fifaCode} size={16} /> : null}
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
                        {i + 1}. {t ? <><TeamFlag code={t.fifaCode} size={14} /> {t.name}</> : "?"}
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

// ─── Scoring audit modal (staged) ──────────────────────────────────────────────

type AuditTeam = { teamId: string; name: string; fifaCode: string } | null;
type AuditQualPick = { team: AuditTeam; correct: boolean };
type AuditQualifier = { team: AuditTeam; predicted: boolean };
type AuditMatch = {
  matchId: string; matchNumber: string;
  home: AuditTeam; away: AuditTeam;
  predictedWinner: AuditTeam; actualWinner: AuditTeam;
  lockedOut: boolean; decided: boolean; correct: boolean;
};
type AuditStage = {
  stageId: string; name: string; type: "GROUP_QUALIFICATION" | "KNOCKOUT";
  roundLabel: string | null; status: string;
  submitted: boolean; hasResult: boolean; pointsPerUnit: number;
  computed: { correctPicks: number; points: number };
  stored: { points: number; correctPicks: number } | null;
  consistent: boolean | null;
  qualification?: { picks: AuditQualPick[]; qualifiers: AuditQualifier[]; totalPicks: number };
  knockout?: { matches: AuditMatch[] };
};
type AuditData = {
  member: { id: string; name: string | null; email: string | null; image: string | null };
  group: { id: string; name: string };
  tournament: { id: string; name: string };
  stages: AuditStage[];
};

function TeamCell({ team, muted }: { team: AuditTeam; muted?: boolean }) {
  if (!team) return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
      <TeamFlag code={team.fifaCode} size={15} />
      <span style={{ fontSize: 12, fontWeight: 600, color: muted ? "var(--muted)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</span>
    </span>
  );
}

function ConsistencyBadge({ stage, t }: { stage: AuditStage; t: ReturnType<typeof useTranslations> }) {
  let label: string;
  let color: string;
  let bg: string;
  if (!stage.submitted) { label = t("audit.notSubmitted"); color = "var(--muted-2)"; bg = "var(--bg-strong)"; }
  else if (!stage.hasResult) { label = t("audit.awaitingResults"); color = "var(--muted)"; bg = "var(--bg-strong)"; }
  else if (stage.stored === null) { label = t("audit.notScored"); color = "var(--accent-strong)"; bg = "var(--accent-soft)"; }
  else if (stage.consistent) { label = `✓ ${t("audit.pointsMatch")}`; color = "#16a34a"; bg = "rgba(22,163,74,0.12)"; }
  else { label = `⚠ ${t("audit.pointsMismatch")}`; color = "var(--live)"; bg = "rgba(220,38,38,0.12)"; }
  return (
    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", padding: "3px 8px", borderRadius: 999, color, background: bg, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function StageAuditCard({ stage, t }: { stage: AuditStage; t: ReturnType<typeof useTranslations> }) {
  const c = stage.computed;
  return (
    <div className="surface-quiet rounded-[var(--r-md)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="eyebrow eyebrow-accent" style={{ margin: 0 }}>{stage.name}</p>
        <ConsistencyBadge stage={stage} t={t} />
      </div>

      {/* Points reconciliation: what the scorer would compute vs. what is stored. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1" style={{ fontSize: 12 }}>
        <span className="muted">
          {t("audit.computedLabel")}:{" "}
          <span className="font-bold mono" style={{ color: "var(--ink)" }}>
            {t("audit.pointsFormula", { correct: c.correctPicks, per: stage.pointsPerUnit, points: c.points })}
          </span>
        </span>
        <span className="muted">
          {t("audit.storedLabel")}:{" "}
          <span className="font-bold mono" style={{ color: stage.consistent === false ? "var(--live)" : "var(--ink)" }}>
            {stage.stored ? t("audit.storedPoints", { points: stage.stored.points, correct: stage.stored.correctPicks }) : "—"}
          </span>
        </span>
      </div>

      {stage.qualification && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">{t("audit.theirPicks", { count: stage.qualification.totalPicks })}</p>
            <ul className="space-y-1">
              {stage.qualification.picks.map((p, i) => (
                <li key={`${p.team?.teamId ?? i}`} className="flex items-center justify-between gap-2 rounded px-2 py-1" style={{ background: p.correct ? "rgba(22,163,74,0.08)" : "transparent" }}>
                  <TeamCell team={p.team} muted={!p.correct} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: p.correct ? "#16a34a" : "var(--muted-2)" }}>{p.correct ? "✓" : "✗"}</span>
                </li>
              ))}
              {stage.qualification.picks.length === 0 && <li className="muted" style={{ fontSize: 12 }}>—</li>}
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-2">{t("audit.actualQualifiers")}</p>
            <ul className="space-y-1">
              {stage.qualification.qualifiers.map((q, i) => (
                <li key={`${q.team?.teamId ?? i}`} className="flex items-center justify-between gap-2 rounded px-2 py-1">
                  <TeamCell team={q.team} muted={!q.predicted} />
                  {q.predicted
                    ? <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "#16a34a" }}>{t("audit.predicted")}</span>
                    : <span style={{ fontSize: 12, color: "var(--muted-2)" }}>·</span>}
                </li>
              ))}
              {stage.qualification.qualifiers.length === 0 && <li className="muted" style={{ fontSize: 12 }}>{t("audit.awaitingResults")}</li>}
            </ul>
          </div>
        </div>
      )}

      {stage.knockout && (
        <ul className="space-y-1.5">
          {stage.knockout.matches.map((m) => {
            const statusEl = m.lockedOut
              ? <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "var(--muted-2)" }}>{t("audit.lockedOut")}</span>
              : !m.decided
                ? <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "var(--muted)" }}>{t("audit.pending")}</span>
                : <span style={{ fontSize: 13, fontWeight: 800, color: m.correct ? "#16a34a" : "var(--live)" }}>{m.correct ? "✓" : "✗"}</span>;
            return (
              <li key={m.matchId} className="grid items-center gap-2 rounded px-2 py-1.5"
                style={{ gridTemplateColumns: "1.6fr 1fr 1fr auto", background: m.correct ? "rgba(22,163,74,0.08)" : m.decided && !m.lockedOut ? "rgba(220,38,38,0.05)" : "transparent" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, minWidth: 0 }}>
                  <TeamCell team={m.home} muted />
                  <span className="muted">v</span>
                  <TeamCell team={m.away} muted />
                </span>
                <span title={t("audit.predictedWinner")}><TeamCell team={m.predictedWinner} /></span>
                <span title={t("audit.actualWinner")}>{m.decided ? <TeamCell team={m.actualWinner} /> : <span className="muted" style={{ fontSize: 12 }}>{t("audit.pending")}</span>}</span>
                <span style={{ justifySelf: "end" }}>{statusEl}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StageAuditModal({ groupId, userId, onClose }: { groupId: string; userId: string; onClose: () => void }) {
  const t = useTranslations("groups.groupRoom");
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/staged/groups/${groupId}/members/${userId}/audit`)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!active) return;
        if (!r.ok) { setError(d?.error ?? "Failed to load audit"); setLoading(false); return; }
        setData(d); setLoading(false);
      })
      .catch(() => { if (active) { setError("Failed to load audit"); setLoading(false); } });
    return () => { active = false; };
  }, [groupId, userId]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const memberName = data ? (data.member.name ?? data.member.email ?? "—") : "…";

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-10"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="surface relative w-full max-w-4xl rounded-[var(--r-xl)] p-6 md:p-8 my-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{t("audit.eyebrow")}</p>
            <h3 className="headline mt-2" style={{ fontSize: 24 }}>{memberName}</h3>
            {data && <p className="text-sm muted mt-1">{data.group.name} · {t("audit.readOnly")}</p>}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
        </div>
        {loading && <p className="muted" style={{ fontSize: 13 }}>{t("audit.loading")}</p>}
        {error && !loading && <p style={{ fontSize: 13, color: "var(--live)" }}>{error}</p>}
        {!loading && data && data.stages.length === 0 && (
          <p className="muted" style={{ fontSize: 13 }}>{t("audit.noSubmissions")}</p>
        )}
        {!loading && data && data.stages.length > 0 && (
          <div className="space-y-4">
            {data.stages.map((s) => <StageAuditCard key={s.stageId} stage={s} t={t} />)}
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
  const tb = useTranslations("badges");

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [myPredictions, setMyPredictions] = useState<UserPrediction[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [auditUserId, setAuditUserId] = useState<string | null>(null);
  const [changingSubmission, setChangingSubmission] = useState(false);
  const [newPredictionId, setNewPredictionId] = useState("");
  const [updatingSubmission, setUpdatingSubmission] = useState(false);
  const [stagedStatus, setStagedStatus] = useState<{
    status: "draft" | "submitted";
    stageName: string;
  } | null>(null);
  const [openStageName, setOpenStageName] = useState<string | null>(null);
  const [openStageId, setOpenStageId] = useState<string | null>(null);
  const [openStageClosesAt, setOpenStageClosesAt] = useState<string | null>(null);
  const [stagedLeaderboard, setStagedLeaderboard] = useState<StagedLeaderboardEntry[]>([]);
  const [stagedStages, setStagedStages] = useState<StagedStage[]>([]);
  const [memberSubmissions, setMemberSubmissions] = useState<Record<string, { submittedAt: string | null; unlockedAt: string | null; unlocksRemaining: number }>>({});
  const [classicPage, setClassicPage] = useState(1);
  const [stagedPage, setStagedPage] = useState(1);
  const [finalPage, setFinalPage] = useState(1);
  const [upgrading, setUpgrading] = useState(false);

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

  // Start a paid member-cap upgrade: ask the server for a Stripe Checkout URL
  // and hand the browser off to Stripe's hosted page.
  async function upgradeGroup(cap: number) {
    if (upgrading) return;
    setUpgrading(true);
    try {
      const res = await fetch(`/api/groups/${params.groupId}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cap }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        alert(data.error ?? "Could not start checkout.");
        setUpgrading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      alert("Could not start checkout.");
      setUpgrading(false);
    }
  }

  async function loadGroup() {
    const res = await fetch(`/api/groups/${params.groupId}`);
    if (res.status === 403) { router.push("/dashboard/groups?error=not-member"); return; }
    if (!res.ok) { setError("Could not load group."); return; }
    const data = await res.json();
    setGroup(data.group);
    setLeaderboard(buildLeaderboard(data.group.submissions ?? []));
    setError("");
    if (data.group?.tournament?.type === "STAGED" && data.group.tournament.id) {
      void loadStagedStatus(data.group.tournament.id);
    }
  }

  async function loadStagedStatus(tournamentId: string) {
    // Load the leaderboard independently so member points always render even if
    // the stages/prediction/submission requests fail or are slow.
    try {
      const lbRes = await fetch(`/api/staged/groups/${params.groupId}/leaderboard?tournamentId=${tournamentId}`);
      if (lbRes.ok) {
        const lbData = await lbRes.json();
        setStagedLeaderboard(lbData.leaderboard ?? []);
      }
    } catch {
      // ignore — leaderboard just stays as-is
    }

    try {
      const stagesRes = await fetch(`/api/staged/tournaments/${tournamentId}/stages`);
      if (!stagesRes.ok) return;
      const stagesData = await stagesRes.json();
      const allStages: StagedStage[] = stagesData.stages ?? [];
      setStagedStages(allStages);

      const openStage = allStages.find((s) => s.status === "OPEN");
      if (openStage) {
        setOpenStageName(openStage.name);
        setOpenStageId(openStage.id);
        setOpenStageClosesAt(openStage.closesAt ?? null);
        const predRes = await fetch(`/api/staged/groups/${params.groupId}/stages/${openStage.id}/prediction`);
        if (predRes.ok) {
          const predData = await predRes.json();
          const pred = predData.prediction;
          setStagedStatus(pred
            ? { status: pred.submittedAt ? "submitted" : "draft", stageName: openStage.name }
            : null
          );
        }
        const subRes = await fetch(`/api/staged/groups/${params.groupId}/stages/${openStage.id}/submissions`);
        if (subRes.ok) {
          const subData = await subRes.json();
          const map: Record<string, { submittedAt: string | null; unlockedAt: string | null; unlocksRemaining: number }> = {};
          for (const s of (subData.submissions ?? []) as { userId: string; submittedAt: string | null; unlockedAt: string | null; unlocksRemaining: number }[]) {
            map[s.userId] = { submittedAt: s.submittedAt, unlockedAt: s.unlockedAt, unlocksRemaining: s.unlocksRemaining ?? 0 };
          }
          setMemberSubmissions(map);
        }
      } else {
        setOpenStageName(null);
        setOpenStageId(null);
        setOpenStageClosesAt(null);
        setStagedStatus(null);
        setMemberSubmissions({});
      }
    } catch {
      // silently ignore — banner falls back to default CTA
    }
  }

  async function unlockPrediction(targetUserId: string, stageId: string) {
    const res = await fetch(
      `/api/staged/groups/${params.groupId}/stages/${stageId}/prediction?userId=${targetUserId}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? "Failed to unlock prediction"); return; }
    const tournamentId = group?.tournament?.id;
    if (tournamentId) void loadStagedStatus(tournamentId);
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

  async function saveGroupName() {
    const next = nameDraft.trim();
    if (!next) { setError(t("nameRequired")); return; }
    setSavingName(true); setError("");
    const res = await fetch(`/api/groups/${params.groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    setSavingName(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? t("nameUpdateError"));
      return;
    }
    setEditingName(false);
    setSuccess(t("nameUpdated"));
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
    void navigator.clipboard.writeText(`${window.location.origin}/dashboard/groups?code=${group.inviteCode}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  const memberCount = group?.memberships.length ?? 0;
  const otherPredictions = myPredictions.filter(p => p.id !== mySubmission?.prediction.id);

  const isStagedTournament = group?.tournament?.type === "STAGED";
  // Portal admins get group-admin controls in any group they open, even when
  // they aren't a member (the API allows this only for APPROVED groups).
  const isPortalAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  const isGroupAdmin = !!group && (
    isPortalAdmin ||
    group.ownerId === currentUserId ||
    group.memberships.some(m => m.userId === currentUserId && m.role === "GROUP_ADMIN")
  );
  const myMembership = group?.memberships.find(m => m.userId === currentUserId);
  const isCurrentUserActive = group?.ownerId === currentUserId || myMembership?.isActive === true;
  const isTournamentFinalized = isStagedTournament && !!group?.tournament?.finalizedAt;
  const sortedLeaderboard = [...stagedLeaderboard].sort((a, b) => b.totalPoints - a.totalPoints || b.totalCorrectPicks - a.totalCorrectPicks);

  // Staged standings rows: use the API's canonical order (points → correct picks
  // → tie-breaker distance) so ties resolve identically to the dashboard, then
  // append members who don't have a score yet.
  const membershipById = Object.fromEntries((group?.memberships ?? []).map((m) => [m.user.id, m]));
  const scoredUserIds = new Set(stagedLeaderboard.map((e) => e.userId));
  const stagedRows = [
    ...stagedLeaderboard.map((e) => ({
      userId: e.userId,
      userName: membershipById[e.userId] ? displayName(membershipById[e.userId].user) : (e.userName ?? ""),
      userImage: membershipById[e.userId]?.user.image ?? e.userImage ?? null,
      totalPoints: e.totalPoints,
      badges: e.badges,
      stages: e.stages,
    })),
    ...(group?.memberships ?? [])
      .filter((m) => !scoredUserIds.has(m.user.id))
      .map((m) => ({ userId: m.user.id, userName: displayName(m.user), userImage: m.user.image ?? null, totalPoints: 0, badges: [] as StagedLeaderboardEntry["badges"], stages: [] as StagedLeaderboardEntry["stages"] })),
  ];

  const renderBadgeIcons = (badges: StagedLeaderboardEntry["badges"], size = 13) =>
    badges.length > 0 ? (
      <span style={{ display: "inline-flex", gap: 2, marginLeft: 5, verticalAlign: "middle" }}>
        {badges.map((b) => (
          <span key={b.slug} title={tb(`${b.slug}.name`)} aria-label={tb(`${b.slug}.name`)} style={{ fontSize: size, lineHeight: 1 }}>
            {b.icon ?? "🏆"}
          </span>
        ))}
      </span>
    ) : null;

  // ── Pagination (20/page) for each leaderboard rendering ──────────────────────
  const classicPag = paginate(leaderboard, classicPage);
  const stagedPag = paginate(stagedRows, stagedPage);
  const finalPag = paginate(sortedLeaderboard, finalPage);
  const myClassicIdx = currentUserId ? leaderboard.findIndex((r) => r.userId === currentUserId) : -1;
  const myStagedIdx = currentUserId ? stagedRows.findIndex((r) => r.userId === currentUserId) : -1;
  const myFinalIdx = currentUserId ? sortedLeaderboard.findIndex((e) => e.userId === currentUserId) : -1;
  const pageOf = (idx: number) => Math.floor(idx / PAGE_SIZE) + 1;

  return (
    <>
      {previewId && <PredictionPreviewModal predictionId={previewId} onClose={() => setPreviewId(null)} />}
      {auditUserId && <StageAuditModal groupId={params.groupId} userId={auditUserId} onClose={() => setAuditUserId(null)} />}

      {/* Bleed wrapper — cancels the dashboard <main> padding */}
      <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-5">

        {/* ── Group header ─────────────────────────────────────────── */}
        <div style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)", padding: "20px 24px 16px" }}>
          {/* Top row: back + actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Link href="/dashboard/groups" className="btn btn-sm btn-ghost">{t("backToDashboard")}</Link>
            <div style={{ display: "flex", gap: 8 }}>
              {isGroupAdmin && (
                <button className="btn btn-sm" onClick={copyInviteLink}>
                  {copiedLink ? t("copied") : t("invite")}
                </button>
              )}
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
                {group ? `GROUP · ${memberCount} ${memberCount !== 1 ? t("members") : t("member")}${isGroupAdmin ? ` · INVITE ${group.inviteCode}` : ""}` : t("groupRoom")}
              </p>
              {editingName && group ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <input
                    className="field"
                    style={{ fontSize: 24, fontWeight: 700, maxWidth: 360 }}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={80}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveGroupName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                  />
                  <button className="btn btn-sm btn-accent" onClick={() => void saveGroupName()} disabled={savingName}>
                    {savingName ? "…" : t("saveName")}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditingName(false)} disabled={savingName}>
                    {t("cancelEditName")}
                  </button>
                </div>
              ) : (
                <h1 className="display" style={{ fontSize: 38, margin: 0, color: "var(--ink)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {group?.name ?? t("loading")}
                  {isGroupAdmin && group && (
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: 12 }}
                      onClick={() => { setNameDraft(group.name); setEditingName(true); }}
                      title={t("editName")}
                      aria-label={t("editName")}
                    >
                      ✏️ {t("editName")}
                    </button>
                  )}
                </h1>
              )}
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
        {group?.tournament?.type === "STAGED" && group.tournament.id && (() => {
          const isInactive = !isCurrentUserActive;
          const noOpenStage = !isTournamentFinalized && !openStageName && !stagedStatus;
          const bannerBg = isTournamentFinalized
            ? "var(--accent-soft)"
            : isInactive
              ? "var(--paper-strong)"
              : stagedStatus?.status === "submitted"
                ? "var(--accent-soft)"
                : stagedStatus?.status === "draft"
                  ? "#fffbeb"
                  : noOpenStage
                    ? "var(--paper-strong)"
                    : "var(--accent-soft)";
          const bannerBorder = isTournamentFinalized
            ? "var(--accent)"
            : isInactive
              ? "var(--border)"
              : stagedStatus?.status === "submitted"
                ? "#86efac"
                : stagedStatus?.status === "draft"
                  ? "#fde68a"
                  : noOpenStage
                    ? "var(--border)"
                    : "var(--accent)";
          const dotColor = isTournamentFinalized
            ? "var(--accent-strong)"
            : isInactive
              ? "var(--muted-2)"
              : stagedStatus?.status === "submitted"
                ? "#16a34a"
                : stagedStatus?.status === "draft"
                  ? "#d97706"
                  : noOpenStage
                    ? "var(--muted-2)"
                    : "var(--accent-strong)";
          const btnBg = isTournamentFinalized
            ? "var(--accent-strong)"
            : stagedStatus?.status === "submitted"
              ? "#16a34a"
              : stagedStatus?.status === "draft"
                ? "#d97706"
                : "var(--accent-strong)";

          return (
            <div style={{
              position: "sticky", top: 64, zIndex: 20,
              background: bannerBg,
              borderBottom: `1px solid ${bannerBorder}`,
              padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: dotColor }} />
                <span style={{ fontSize: 13 }}>
                  {isTournamentFinalized ? (
                    <>
                      <strong style={{ color: "var(--accent-strong)" }}>{t("finalizedTitle")}</strong>
                      {" "}<span style={{ color: "var(--muted)" }}>{t("finalizedDesc")}</span>
                    </>
                  ) : isInactive ? (
                    <>
                      <strong style={{ color: "var(--muted)" }}>{t("inactiveTitle")}</strong>
                      {" "}<span style={{ color: "var(--muted)" }}>{t("inactiveDesc")}</span>
                    </>
                  ) : stagedStatus?.status === "submitted" ? (
                    <>
                      <strong style={{ color: "#16a34a" }}>{t("picksSubmitted")}</strong>
                      {" "}<span style={{ color: "var(--muted)" }}>{t("picksSubmittedDesc", { stageName: stagedStatus.stageName })}</span>
                    </>
                  ) : stagedStatus?.status === "draft" ? (
                    <>
                      <strong style={{ color: "#d97706" }}>{t("draftSaved")}</strong>
                      {" "}<span style={{ color: "var(--muted)" }}>{t("draftSavedDesc", { stageName: stagedStatus.stageName })}</span>
                    </>
                  ) : noOpenStage ? (
                    <>
                      <strong style={{ color: "var(--muted)" }}>{t("noStageOpen")}</strong>
                      {" "}<span style={{ color: "var(--muted)" }}>{t("noStageOpenDesc")}</span>
                    </>
                  ) : (
                    <>
                      <strong>{t("stagePredictionsOpen", { stageName: openStageName ?? "" })}</strong>
                      {" "}<span style={{ color: "var(--muted)" }}>{t("stagePredictionsDesc")}</span>
                    </>
                  )}
                </span>
              </div>
              {!noOpenStage && !isInactive && (
                <Link
                  href={`/dashboard/groups/${params.groupId}/predictions/${group.tournament.id}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: btnBg,
                    color: "#fff",
                    borderRadius: 999, padding: "7px 18px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", textDecoration: "none",
                  }}
                >
                  {isTournamentFinalized ? t("viewPredictions") : stagedStatus?.status === "submitted" ? t("viewPredictions") : stagedStatus?.status === "draft" ? t("continuePredictions") : t("makePredictions")}
                </Link>
              )}
            </div>
          );
        })()}

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
        {!isStagedTournament && (
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
        )}

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
            {isTournamentFinalized && sortedLeaderboard.length > 0 && (
              <div style={{ padding: "32px 24px 24px" }}>
                {/* Podium */}
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--muted)", marginBottom: 24 }}>{t("finalStandings")}</p>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 12, marginBottom: 32 }}>
                  {[1, 0, 2].map((pos) => {
                    const entry = sortedLeaderboard[pos];
                    if (!entry) return <div key={pos} style={{ flex: 1 }} />;
                    const isFirst = pos === 0;
                    const heights = [120, 160, 100];
                    const medals = ["🥈", "🥇", "🥉"];
                    const bgColors = ["var(--bg-strong)", "var(--accent-soft)", "var(--bg-strong)"];
                    const isMe = entry.userId === currentUserId;
                    return (
                      <div key={pos} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                        <Avatar userId={entry.userId} name={entry.userName ?? ""} image={entry.userImage} size={isFirst ? 64 : 48} />
                        <span style={{ fontSize: isFirst ? 13 : 12, fontWeight: 700, textAlign: "center", color: "var(--ink)" }}>
                          {entry.userName}{isMe && ` ${t("youLabel")}`}{renderBadgeIcons(entry.badges, 12)}
                        </span>
                        <span style={{ fontSize: isFirst ? 22 : 18, fontWeight: 900, color: "var(--accent-strong)" }}>{entry.totalPoints}</span>
                        <div style={{
                          width: "100%", height: heights[pos === 0 ? 1 : pos === 1 ? 0 : 2],
                          background: bgColors[pos === 0 ? 1 : pos === 1 ? 0 : 2],
                          border: "1px solid var(--border)", borderRadius: "12px 12px 0 0",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: isFirst ? 32 : 24,
                        }}>
                          {medals[pos === 0 ? 1 : pos === 1 ? 0 : 2]}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Full ranking table */}
                <div style={{ borderTop: "1px solid var(--border)" }}>
                  {finalPag.pageRows.map((entry, localIdx) => {
                    const idx = finalPag.start + localIdx;
                    const isMe = entry.userId === currentUserId;
                    return (
                      <div key={entry.userId} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                        borderBottom: "1px solid var(--border)",
                        background: isMe ? "var(--accent-soft)" : "transparent",
                      }}>
                        <span style={{ width: 28, textAlign: "center", fontSize: 12, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                        </span>
                        <Avatar userId={entry.userId} name={entry.userName ?? ""} image={entry.userImage} size={34} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                          {entry.userName}
                          {isMe && <span className="chip chip-accent" style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px" }}>{t("youLabel")}</span>}
                          {renderBadgeIcons(entry.badges)}
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--accent-strong)" }}>{entry.totalPoints}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 60, textAlign: "right" }}>{entry.totalCorrectPicks} {t("correctLabel")}</span>
                      </div>
                    );
                  })}
                </div>
                {myFinalIdx >= 0 && pageOf(myFinalIdx) !== finalPag.page && (
                  <MyRankStrip
                    rank={myFinalIdx + 1}
                    name={sortedLeaderboard[myFinalIdx].userName ?? ""}
                    points={sortedLeaderboard[myFinalIdx].totalPoints}
                    youLabel={t("youLabel")}
                    jumpLabel={t("jumpToYou")}
                    onJump={() => setFinalPage(pageOf(myFinalIdx))}
                  />
                )}
                <Paginator
                  page={finalPag.page}
                  pageCount={finalPag.pageCount}
                  total={sortedLeaderboard.length}
                  totalLabel={t("membersWord")}
                  prevLabel={t("prevPage")}
                  nextLabel={t("nextPage")}
                  onPage={setFinalPage}
                />
              </div>
            )}
            {isStagedTournament ? (
              <>
              <table className="tabular" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th>{t("memberHeader")}</th>
                    <th style={{ textAlign: "right", width: 60 }}>{t("ptsHeader")}</th>
                    {stagedStages.map((s) => (
                      <th key={s.id} style={{ textAlign: "right", fontSize: 11, whiteSpace: "nowrap" }}>
                        {s.name}
                        {s.status === "OPEN" && (
                          <span style={{ display: "block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent-strong)", marginTop: 2 }}>{t("stageNow")}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stagedPag.pageRows
                    .map((entry, idx) => {
                      const isMe = entry.userId === currentUserId;
                      const stageMap = Object.fromEntries(entry.stages.map((s) => [s.stageId, s]));
                      return (
                        <tr key={entry.userId} style={{ background: isMe ? "var(--accent-soft)" : "transparent" }}>
                          <td><MedalBadge rank={stagedPag.start + idx + 1} /></td>
                          <td>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Avatar userId={entry.userId} name={entry.userName} image={entry.userImage} size={30} />
                              <span style={{ fontWeight: 600, fontSize: 13 }}>
                                {entry.userName}
                                {isMe && <span className="chip chip-accent" style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px" }}>{t("youLabel")}</span>}
                                {renderBadgeIcons(entry.badges)}
                              </span>
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <span className="mono" style={{ fontSize: 16, fontWeight: 800, color: isMe ? "var(--accent-strong)" : "var(--ink)" }}>
                              <CountUp value={entry.totalPoints} />
                            </span>
                          </td>
                          {stagedStages.map((s) => {
                            const sd = stageMap[s.id];
                            return (
                              <td key={s.id} style={{ textAlign: "right", color: "var(--muted)", fontSize: 13 }}>
                                {sd ? (
                                  <span>
                                    {sd.points}
                                    {s.status !== "SCORED" && (
                                      <span style={{ fontSize: 9, marginLeft: 3, color: "var(--accent-strong)", fontWeight: 700 }}>~</span>
                                    )}
                                  </span>
                                ) : s.status === "SCORED" ? "–" : <span style={{ fontSize: 10, fontStyle: "italic" }}>{t("notScoredYet")}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {myStagedIdx >= 0 && pageOf(myStagedIdx) !== stagedPag.page && (
                <MyRankStrip
                  rank={myStagedIdx + 1}
                  name={stagedRows[myStagedIdx].userName}
                  points={stagedRows[myStagedIdx].totalPoints}
                  youLabel={t("youLabel")}
                  jumpLabel={t("jumpToYou")}
                  onJump={() => setStagedPage(pageOf(myStagedIdx))}
                />
              )}
              <Paginator
                page={stagedPag.page}
                pageCount={stagedPag.pageCount}
                total={stagedRows.length}
                totalLabel={t("membersWord")}
                prevLabel={t("prevPage")}
                nextLabel={t("nextPage")}
                onPage={setStagedPage}
              />
              </>
            ) : leaderboard.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("noSubmissionsYet")}</p>
              </div>
            ) : (
              <>
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
                  {classicPag.pageRows.map((row, idx) => {
                    const isMe = row.userId === currentUserId;
                    const rank = classicPag.start + idx + 1;
                    return (
                      <tr
                        key={row.userId}
                        style={{
                          background: isMe ? "var(--accent-soft)" : "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => setPreviewId(row.predictionId)}
                      >
                        <td>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <MedalBadge rank={rank} />
                          </span>
                        </td>
                        <td>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Avatar userId={row.userId} name={row.userName} image={row.userImage} size={30} />
                            <span style={{ fontWeight: 600, fontSize: 13 }}>
                              {row.userName}
                              {isMe && <span className="chip chip-accent" style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px" }}>{t("youLabel")}</span>}
                            </span>
                          </span>
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: 12, maxWidth: 160 }}>
                          <span className="truncate" style={{ display: "block" }}>&ldquo;{row.predictionName}&rdquo;</span>
                        </td>
                        <td>
                          <BreakdownBar breakdown={row.breakdown} />
                          <div className="mono muted" style={{ fontSize: 10, marginTop: 3, letterSpacing: "0.04em" }}>
                            M·{row.breakdown.MATCH} S·{row.breakdown.GROUP_STANDING} K·{row.breakdown.KNOCKOUT} T·{row.breakdown.TIEBREAKER}
                          </div>
                        </td>
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
              {myClassicIdx >= 0 && pageOf(myClassicIdx) !== classicPag.page && (
                <MyRankStrip
                  rank={myClassicIdx + 1}
                  name={leaderboard[myClassicIdx].userName}
                  points={leaderboard[myClassicIdx].points}
                  youLabel={t("youLabel")}
                  jumpLabel={t("jumpToYou")}
                  onJump={() => setClassicPage(pageOf(myClassicIdx))}
                />
              )}
              <Paginator
                page={classicPag.page}
                pageCount={classicPag.pageCount}
                total={leaderboard.length}
                totalLabel={t("membersWord")}
                prevLabel={t("prevPage")}
                nextLabel={t("nextPage")}
                onPage={setClassicPage}
              />
              </>
            )}
          </div>

          {/* ── Right rail ─────────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--paper-strong)", display: "flex", flexDirection: "column" }} className="lg:border-t-0 lg:border-l">

            {/* Your drafts — hidden for STAGED tournaments */}
            {group?.tournament?.type !== "STAGED" && (
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
            )}

            {/* Tournament news */}
            <GroupNews tournamentId={group?.tournament?.id} />
          </div>
        </div>

        {/* ── Members — group-admin only, full-width below ─────────── */}
        {isGroupAdmin && group && (
          <MemberManager
            groupId={params.groupId}
            memberships={group.memberships}
            ownerId={group.ownerId}
            currentUserId={currentUserId}
            memberSubmissions={memberSubmissions}
            openStageId={openStageId}
            memberCount={memberCount}
            memberCap={group.memberCap}
            upgrading={upgrading}
            onUpgrade={(cap) => void upgradeGroup(cap)}
            onChanged={() => void loadGroup()}
            onUnlock={(uid, sid) => void unlockPrediction(uid, sid)}
            onAudit={(uid) => setAuditUserId(uid)}
            isStaged={isStagedTournament}
            onInvite={copyInviteLink}
            isPortalAdmin={isPortalAdmin}
            openStageClosesAt={openStageClosesAt}
          />
        )}

        {/* ── Mobile bottom spacing (offsets bottom nav) ─────────────── */}
        <div className="h-28 lg:h-0" />
      </div>
    </>
  );
}
