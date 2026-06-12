"use client";

import { ReactNode, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Link } from "@/lib/navigation";

type TournamentGroup = { id: string; name: string; sortOrder: number };
type TournamentPhase = { id: string; name: string; slug: string; sortOrder: number; isKnockout: boolean; teamCount?: number | null };
type TieBreaker = { id: string; prompt: Record<string, string>; sortOrder: number; type: "NUMBER" | "TEXT"; correctAnswer?: string | null };
type TournamentTag = { id: string; name: string; slug: string };
type GroupRow = { id?: string; clientId: string; name: string; sortOrder: number };
type PhaseRow = { id?: string; clientId: string; name: string; slug: string; sortOrder: number; isKnockout: boolean; teamCount?: number | null };
type TieBreakerRow = { id?: string; clientId: string; prompt: Record<string, string>; sortOrder: number; type: "NUMBER" | "TEXT"; correctAnswer?: string | null };
type Tournament = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  teamsPerGroup?: number | null;
  submissionDeadline?: string | null;
  isActive?: boolean;
  archivedAt?: string | null;
  groups: TournamentGroup[];
  phases: TournamentPhase[];
  tieBreakers: TieBreaker[];
  tags: TournamentTag[];
};
type TournamentListItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  archivedAt?: string | null;
  type: "CLASSIC" | "STAGED";
  tags: TournamentTag[];
  _count: {
    groups: number;
    phases: number;
    matches: number;
    predictions: number;
    groupRooms: number;
    stages: number;
  };
};
type Team = {
  id: string;
  name: string;
  fifaCode: string;
  groupMemberships: Array<{ seed?: number | null; group: { id: string; name: string; tournamentId: string } }>;
};
type AdminUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "USER" | "ADMIN";
  _count: {
    memberships: number;
    predictions: number;
    submissions: number;
  };
};
type AdminGroupRoom = {
  id: string;
  name: string;
  description?: string | null;
  inviteCode: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  owner: { id: string; name?: string | null; email?: string | null };
  tournament?: { id: string; name: string; slug: string } | null;
  _count: {
    memberships: number;
    submissions: number;
  };
};
type SponsoredPlacement = {
  id: string;
  title: string;
  summary?: string | null;
  imageUrl?: string | null;
  targetUrl: string;
  ctaLabel?: string | null;
  sponsorName?: string | null;
  badgeLabel: string;
  priority: number;
  isActive: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
};
type AdminModal =
  | { type: "tournament" }
  | { type: "user" }
  | { type: "sponsored" }
  | { type: "archiveTournament"; tournament: TournamentListItem }
  | { type: "deleteUser"; user: AdminUser }
  | { type: "deleteSponsored"; placement: SponsoredPlacement }
  | { type: "deleteMatch"; match: Match }
  | null;
type Match = {
  id: string;
  label?: string | null;
  phase: { id: string; name: string };
  group?: { id: string; name: string } | null;
  homeTeam?: { id: string; name: string } | null;
  awayTeam?: { id: string; name: string } | null;
  homeSourceType: "TEAM" | "GROUP_POSITION" | "MATCH_RESULT" | "PLACEHOLDER" | "BEST_THIRD";
  awaySourceType: "TEAM" | "GROUP_POSITION" | "MATCH_RESULT" | "PLACEHOLDER" | "BEST_THIRD";
  homeSourceThirdRank?: number | null;
  awaySourceThirdRank?: number | null;
  homeSourceThirdGroups?: string | null;
  awaySourceThirdGroups?: string | null;
  homePlaceholder?: string | null;
  awayPlaceholder?: string | null;
  homeSourceGroup?: { id: string; name: string } | null;
  awaySourceGroup?: { id: string; name: string } | null;
  homeSourcePosition?: number | null;
  awaySourcePosition?: number | null;
  homeSourceMatch?: { id: string; label?: string | null; phase: { name: string } } | null;
  awaySourceMatch?: { id: string; label?: string | null; phase: { name: string } } | null;
  homeSourceOutcome?: "WINNER" | "LOSER" | null;
  awaySourceOutcome?: "WINNER" | "LOSER" | null;
  scheduledAt?: string | null;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
};

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function createDefaultGroupRows(): GroupRow[] {
  return [
    { clientId: createClientId("group"), name: "Group A", sortOrder: 0 },
    { clientId: createClientId("group"), name: "Group B", sortOrder: 1 },
    { clientId: createClientId("group"), name: "Group C", sortOrder: 2 },
    { clientId: createClientId("group"), name: "Group D", sortOrder: 3 },
  ];
}

function createDefaultPhaseRows(): PhaseRow[] {
  return [
    { clientId: createClientId("phase"), slug: "group-stage", name: "Group Stage", sortOrder: 0, isKnockout: false, teamCount: 32 },
    { clientId: createClientId("phase"), slug: "round-of-16", name: "Round of 16", sortOrder: 1, isKnockout: true, teamCount: 16 },
    { clientId: createClientId("phase"), slug: "quarter-finals", name: "Quarter Finals", sortOrder: 2, isKnockout: true, teamCount: 8 },
    { clientId: createClientId("phase"), slug: "semi-finals", name: "Semi Finals", sortOrder: 3, isKnockout: true, teamCount: 4 },
    { clientId: createClientId("phase"), slug: "final", name: "Final", sortOrder: 4, isKnockout: true, teamCount: 2 },
  ];
}

function createDefaultTieBreakerRows(): TieBreakerRow[] {
  return [
    { clientId: createClientId("tiebreaker"), type: "NUMBER", prompt: { en: "In what minute will the first goal be scored in the final?", es: "¿En qué minuto se marcará el primer gol de la final?" }, sortOrder: 0, correctAnswer: "" },
    { clientId: createClientId("tiebreaker"), type: "NUMBER", prompt: { en: "What will be the combined score of the final?", es: "¿Cuál será el marcador combinado de la final?" }, sortOrder: 1, correctAnswer: "" },
  ];
}

function getTournamentMembership(team: Team, tournamentId?: string | null) {
  if (!tournamentId) return null;
  return team.groupMemberships.find((membership) => membership.group.tournamentId === tournamentId) ?? null;
}

function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="surface rounded-[2rem] p-6 md:p-8" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{title}</p>
          <p className="mt-2 text-sm muted">{description}</p>
        </div>
        <span className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: "var(--bg-strong)", color: "var(--accent-strong)" }}>
          Toggle
        </span>
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}

export default function DashboardAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if ((session?.user as { role?: string } | undefined)?.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groupRooms, setGroupRooms] = useState<AdminGroupRoom[]>([]);
  const [sponsoredPlacements, setSponsoredPlacements] = useState<SponsoredPlacement[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<AdminModal>(null);

  const [tournamentName, setTournamentName] = useState("");
  const [tournamentType, setTournamentType] = useState<"CLASSIC" | "STAGED">("CLASSIC");
  const [slug, setSlug] = useState("world-cup");
  const [description, setDescription] = useState("");
  const [teamsPerGroup, setTeamsPerGroup] = useState("4");
  const [submissionDeadline, setSubmissionDeadline] = useState("");
  const [tournamentTags, setTournamentTags] = useState("");
  const [groupRows, setGroupRows] = useState<GroupRow[]>(createDefaultGroupRows);
  const [phaseRows, setPhaseRows] = useState<PhaseRow[]>(createDefaultPhaseRows);
  const [tieBreakerRows, setTieBreakerRows] = useState<TieBreakerRow[]>(createDefaultTieBreakerRows);

  const [editingTeamId, setEditingTeamId] = useState("");
  const [editingTeamRowKey, setEditingTeamRowKey] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [teamGroupId, setTeamGroupId] = useState("");
  const [teamSeed, setTeamSeed] = useState("0");
  const [editingUserId, setEditingUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<"USER" | "ADMIN">("USER");
  const [userPassword, setUserPassword] = useState("");
  const [editingSponsoredId, setEditingSponsoredId] = useState("");
  const [sponsoredTitle, setSponsoredTitle] = useState("");
  const [sponsoredSummary, setSponsoredSummary] = useState("");
  const [sponsoredImageUrl, setSponsoredImageUrl] = useState("");
  const [sponsoredTargetUrl, setSponsoredTargetUrl] = useState("");
  const [sponsoredCtaLabel, setSponsoredCtaLabel] = useState("");
  const [sponsoredSponsorName, setSponsoredSponsorName] = useState("");
  const [sponsoredBadgeLabel, setSponsoredBadgeLabel] = useState("Sponsored");
  const [sponsoredPriority, setSponsoredPriority] = useState("0");
  const [sponsoredActiveFrom, setSponsoredActiveFrom] = useState("");
  const [sponsoredActiveTo, setSponsoredActiveTo] = useState("");
  const [sponsoredIsActive, setSponsoredIsActive] = useState(true);

  const [editingMatchId, setEditingMatchId] = useState("");
  const [matchPhaseId, setMatchPhaseId] = useState("");
  const [matchGroupId, setMatchGroupId] = useState("");
  const [matchLabel, setMatchLabel] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [homeSourceType, setHomeSourceType] = useState<Match["homeSourceType"]>("TEAM");
  const [awaySourceType, setAwaySourceType] = useState<Match["awaySourceType"]>("TEAM");
  const [homeSourceGroupId, setHomeSourceGroupId] = useState("");
  const [awaySourceGroupId, setAwaySourceGroupId] = useState("");
  const [homeSourcePosition, setHomeSourcePosition] = useState("1");
  const [awaySourcePosition, setAwaySourcePosition] = useState("2");
  const [homeSourceMatchId, setHomeSourceMatchId] = useState("");
  const [awaySourceMatchId, setAwaySourceMatchId] = useState("");
  const [homeSourceOutcome, setHomeSourceOutcome] = useState<"WINNER" | "LOSER">("WINNER");
  const [awaySourceOutcome, setAwaySourceOutcome] = useState<"WINNER" | "LOSER">("WINNER");
  const [homePlaceholder, setHomePlaceholder] = useState("");
  const [awayPlaceholder, setAwayPlaceholder] = useState("");
  const [homeSourceThirdRank, setHomeSourceThirdRank] = useState("1");
  const [awaySourceThirdRank, setAwaySourceThirdRank] = useState("1");
  const [homeSourceThirdGroups, setHomeSourceThirdGroups] = useState("");
  const [awaySourceThirdGroups, setAwaySourceThirdGroups] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const [resultMatchId, setResultMatchId] = useState("");
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [tieBreakerAnswers, setTieBreakerAnswers] = useState<Record<string, string>>({});
  const [draggedPhaseClientId, setDraggedPhaseClientId] = useState("");

  const currentTournamentId = tournament?.id ?? null;
  const effectiveTeamsPerGroup = Math.max(Number(teamsPerGroup || "0") || 0, 1);
  const groupedTeamTables = (tournament?.groups ?? []).map((group) => {
    const assignedTeams = teams
      .map((team) => {
        const membership = getTournamentMembership(team, currentTournamentId);
        if (!membership || membership.group.id !== group.id) return null;
        return {
          team,
          seed: membership.seed ?? null,
        };
      })
      .filter((entry): entry is { team: Team; seed: number | null } => Boolean(entry))
      .sort((a, b) => {
        const aSeed = a.seed ?? Number.MAX_SAFE_INTEGER;
        const bSeed = b.seed ?? Number.MAX_SAFE_INTEGER;
        if (aSeed !== bSeed) return aSeed - bSeed;
        return a.team.name.localeCompare(b.team.name);
      });

    const slotCount = Math.max(effectiveTeamsPerGroup, assignedTeams.length);
    const seededEntries = new Map<number, { team: Team; seed: number | null }>();
    const overflowEntries: Array<{ team: Team; seed: number | null }> = [];

    assignedTeams.forEach((assigned) => {
      if (assigned.seed != null && assigned.seed >= 0 && !seededEntries.has(assigned.seed)) {
        seededEntries.set(assigned.seed, assigned);
        return;
      }
      overflowEntries.push(assigned);
    });

    const rows = Array.from({ length: slotCount }, (_, index) => {
      const seededEntry = seededEntries.get(index + 1); // seeds are 1-based
      if (seededEntry) {
        return { slot: index, entry: seededEntry };
      }

      const overflowEntry = overflowEntries.shift() ?? null;
      return { slot: index, entry: overflowEntry };
    });

    return { group, rows };
  });

  const unassignedTeams = teams.filter((team) => !getTournamentMembership(team, currentTournamentId));
  const availableMatchTeams = matchGroupId
    ? teams.filter((team) => getTournamentMembership(team, currentTournamentId)?.group.id === matchGroupId)
    : teams;

  function resetTeamForm() {
    setEditingTeamId("");
    setEditingTeamRowKey("");
    setTeamName("");
    setTeamCode("");
    setTeamGroupId("");
    setTeamSeed("0");
  }

  function resetUserForm() {
    setEditingUserId("");
    setUserName("");
    setUserEmail("");
    setUserRole("USER");
    setUserPassword("");
  }

  function resetSponsoredForm() {
    setEditingSponsoredId("");
    setSponsoredTitle("");
    setSponsoredSummary("");
    setSponsoredImageUrl("");
    setSponsoredTargetUrl("");
    setSponsoredCtaLabel("");
    setSponsoredSponsorName("");
    setSponsoredBadgeLabel("Sponsored");
    setSponsoredPriority("0");
    setSponsoredActiveFrom("");
    setSponsoredActiveTo("");
    setSponsoredIsActive(true);
  }

  function resetMatchForm() {
    setEditingMatchId("");
    setMatchPhaseId(tournament?.phases[0]?.id ?? "");
    setMatchGroupId("");
    setMatchLabel("");
    setHomeTeamId("");
    setAwayTeamId("");
    setHomeSourceType("TEAM");
    setAwaySourceType("TEAM");
    setHomeSourceGroupId("");
    setAwaySourceGroupId("");
    setHomeSourcePosition("1");
    setAwaySourcePosition("2");
    setHomeSourceMatchId("");
    setAwaySourceMatchId("");
    setHomeSourceOutcome("WINNER");
    setAwaySourceOutcome("WINNER");
    setHomePlaceholder("");
    setAwayPlaceholder("");
    setHomeSourceThirdRank("1");
    setAwaySourceThirdRank("1");
    setHomeSourceThirdGroups("");
    setAwaySourceThirdGroups("");
    setScheduledAt("");
  }

  function startEditingMatch(match: Match) {
    setEditingMatchId(match.id);
    setMatchPhaseId(match.phase.id);
    setMatchGroupId(match.group?.id ?? "");
    setMatchLabel(match.label ?? "");
    setHomeSourceType(match.homeSourceType);
    setAwaySourceType(match.awaySourceType);
    setHomeTeamId(match.homeTeam?.id ?? "");
    setAwayTeamId(match.awayTeam?.id ?? "");
    setHomeSourceGroupId(match.homeSourceGroup?.id ?? "");
    setAwaySourceGroupId(match.awaySourceGroup?.id ?? "");
    setHomeSourcePosition(String(match.homeSourcePosition ?? 1));
    setAwaySourcePosition(String(match.awaySourcePosition ?? 2));
    setHomeSourceMatchId(match.homeSourceMatch?.id ?? "");
    setAwaySourceMatchId(match.awaySourceMatch?.id ?? "");
    setHomeSourceOutcome(match.homeSourceOutcome ?? "WINNER");
    setAwaySourceOutcome(match.awaySourceOutcome ?? "WINNER");
    setHomePlaceholder(match.homePlaceholder ?? "");
    setAwayPlaceholder(match.awayPlaceholder ?? "");
    setHomeSourceThirdRank(String(match.homeSourceThirdRank ?? 1));
    setAwaySourceThirdRank(String(match.awaySourceThirdRank ?? 1));
    setHomeSourceThirdGroups(match.homeSourceThirdGroups ?? "");
    setAwaySourceThirdGroups(match.awaySourceThirdGroups ?? "");
    setScheduledAt(match.scheduledAt ? new Date(match.scheduledAt).toISOString().slice(0, 16) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadTournament(tournamentId?: string) {
    const query = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : "";
    const res = await fetch(`/api/admin/tournament${query}`);
    if (!res.ok) return;
    const data = await res.json();
    const activeTournament = data.tournament;
    setTournament(activeTournament);
    if (activeTournament) {
      setTournamentName(activeTournament.name);
      setTournamentType(activeTournament.type === "STAGED" ? "STAGED" : "CLASSIC");
      setSlug(activeTournament.slug);
      setDescription(activeTournament.description ?? "");
      setTeamsPerGroup(activeTournament.teamsPerGroup == null ? "4" : String(activeTournament.teamsPerGroup));
      setSubmissionDeadline(activeTournament.submissionDeadline ? new Date(activeTournament.submissionDeadline).toISOString().slice(0, 16) : "");
      setTournamentTags((activeTournament.tags ?? []).map((tag: TournamentTag) => tag.name).join(", "));
      setGroupRows(
        activeTournament.groups.map((group: TournamentGroup, index: number) => ({
          id: group.id,
          clientId: group.id ?? createClientId("group"),
          name: group.name,
          sortOrder: group.sortOrder ?? index,
        }))
      );
      setPhaseRows(
        activeTournament.phases.map((phase: TournamentPhase, index: number) => ({
          id: phase.id,
          clientId: phase.id ?? createClientId("phase"),
          name: phase.name,
          slug: phase.slug,
          sortOrder: phase.sortOrder ?? index,
          isKnockout: phase.isKnockout,
          teamCount: phase.teamCount ?? null,
        }))
      );
      setTieBreakerRows(
        activeTournament.tieBreakers.map((question: TieBreaker, index: number) => ({
          id: question.id,
          clientId: question.id ?? createClientId("tiebreaker"),
          prompt: question.prompt,
          sortOrder: question.sortOrder ?? index,
          type: question.type,
          correctAnswer: question.correctAnswer ?? "",
        }))
      );
      setTieBreakerAnswers(
        Object.fromEntries(
          activeTournament.tieBreakers.map((question: TieBreaker) => [question.id, question.correctAnswer ?? ""])
        )
      );
      setMatchPhaseId(activeTournament.phases[0]?.id ?? "");
    } else {
      setTournamentName("");
      setTournamentType("CLASSIC");
      setSlug("world-cup");
      setDescription("");
      setTeamsPerGroup("4");
      setSubmissionDeadline("");
      setTournamentTags("");
      setGroupRows(createDefaultGroupRows());
      setPhaseRows(createDefaultPhaseRows());
      setTieBreakerRows(createDefaultTieBreakerRows());
      setTieBreakerAnswers({});
    }
  }

  async function selectTournament(tournamentId: string) {
    await fetch("/api/tournament/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId }),
    });
  }

  async function loadTournamentList() {
    const res = await fetch("/api/admin/tournaments");
    if (!res.ok) return;
    const data = await res.json();
    setTournaments(data.tournaments || []);
  }

  async function loadTeams(tournamentId?: string) {
    const query = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : "";
    const res = await fetch(`/api/admin/teams${query}`);
    if (!res.ok) return;
    const data = await res.json();
    setTeams(data.teams || []);
  }

  async function loadMatches(tournamentId?: string) {
    const query = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : "";
    const res = await fetch(`/api/admin/matches${query}`);
    if (!res.ok) return;
    const data = await res.json();
    setMatches(data.matches || []);
  }

  async function loadUsers() {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users || []);
  }

  async function loadGroupRooms() {
    const res = await fetch("/api/admin/groups");
    if (!res.ok) return;
    const data = await res.json();
    setGroupRooms(data.groups || []);
  }

  async function setGroupStatus(groupId: string, status: "APPROVED" | "REJECTED") {
    setMessage("");
    setError("");
    const res = await fetch("/api/admin/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, status }),
    });
    if (!res.ok) {
      setError("Could not update the group.");
      return;
    }
    setMessage(status === "APPROVED" ? "Group approved." : "Group rejected.");
    await loadGroupRooms();
  }

  async function loadSponsoredPlacements(tournamentId?: string) {
    const query = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : "";
    const res = await fetch(`/api/admin/sponsored${query}`);
    if (!res.ok) {
      setSponsoredPlacements([]);
      return;
    }
    const data = await res.json();
    setSponsoredPlacements(data.placements || []);
  }

  useEffect(() => {
    async function loadAll() {
      await Promise.all([loadTournament(), loadTournamentList(), loadTeams(), loadMatches(), loadUsers(), loadGroupRooms(), loadSponsoredPlacements()]);
    }

    void loadAll();
  }, []);

  async function saveTournament(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    const res = await fetch("/api/admin/tournament", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: tournament?.id ?? null,
        name: tournamentName,
        type: tournamentType,
        slug,
        description,
        teamsPerGroup: teamsPerGroup ? Number(teamsPerGroup) : null,
        submissionDeadline: submissionDeadline ? new Date(submissionDeadline).toISOString() : null,
        tags: tournamentTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
        groups: groupRows
          .map((group, index) => ({
            id: group.id,
            name: group.name.trim(),
            sortOrder: index,
          }))
          .filter((group) => group.name),
        phases: phaseRows
          .map((phase, index) => ({
            id: phase.id,
            slug: phase.slug.trim(),
            name: phase.name.trim(),
            sortOrder: index,
            isKnockout: phase.isKnockout,
            teamCount: phase.teamCount ?? null,
          }))
          .filter((phase) => phase.slug && phase.name),
        tieBreakers: tieBreakerRows
          .map((question, index) => ({
            id: question.id,
            type: question.type,
            prompt: question.prompt,
            sortOrder: index,
            correctAnswer: question.correctAnswer ?? "",
          }))
          .filter((question) => Object.values(question.prompt).some((v) => v)),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not save tournament.");
      return;
    }

    const data = await res.json().catch(() => null);
    if (data?.tournament?.id) {
      await selectTournament(data.tournament.id);
    }
    setMessage("Tournament configuration saved.");
    await Promise.all([loadTournament(data?.tournament?.id), loadTournamentList(), loadMatches(data?.tournament?.id), loadTeams(data?.tournament?.id), loadSponsoredPlacements(data?.tournament?.id)]);
    setModal(null);
  }

  function startNewTournament() {
    setTournament(null);
    setTournamentName("");
    setTournamentType("CLASSIC");
    setSlug("new-tournament");
    setDescription("");
    setTeamsPerGroup("4");
    setTournamentTags("");
    setGroupRows(createDefaultGroupRows());
    setPhaseRows(createDefaultPhaseRows());
    setTieBreakerRows(createDefaultTieBreakerRows());
    setTieBreakerAnswers({});
    setMessage("Creating a new tournament.");
    setError("");
    setModal({ type: "tournament" });
  }

  async function editTournament(tournamentId: string) {
    await selectTournament(tournamentId);
    await Promise.all([loadTournament(tournamentId), loadTeams(tournamentId), loadMatches(tournamentId), loadSponsoredPlacements(tournamentId)]);
    setMessage("Tournament loaded into the editor.");
    setError("");
    setModal({ type: "tournament" });
  }

  async function updateTournamentStatus(tournamentId: string, action: "archive" | "restore" | "activate") {
    setMessage("");
    setError("");

    const res = await fetch(`/api/admin/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not update tournament status.");
      return;
    }

    if (action === "activate" || (action === "restore" && tournament?.id === tournamentId)) {
      await selectTournament(tournamentId);
    }

    setMessage(
      action === "archive"
        ? "Tournament archived."
        : action === "restore"
          ? "Tournament restored."
          : "Tournament activated."
    );
    await Promise.all([loadTournamentList(), loadTournament(), loadTeams(), loadMatches(), loadSponsoredPlacements()]);
    setModal(null);
  }

  function updateGroupRow(clientId: string, changes: Partial<GroupRow>) {
    setGroupRows((current) => current.map((group, index) => (
      group.clientId === clientId ? { ...group, ...changes, sortOrder: changes.sortOrder ?? index } : group
    )));
  }

  function updatePhaseRow(clientId: string, changes: Partial<PhaseRow>) {
    setPhaseRows((current) => current.map((phase, index) => (
      phase.clientId === clientId ? { ...phase, ...changes, sortOrder: changes.sortOrder ?? index } : phase
    )));
  }

  function movePhaseRow(sourceClientId: string, targetClientId: string) {
    if (!sourceClientId || sourceClientId === targetClientId) return;
    setPhaseRows((current) => {
      const sourceIndex = current.findIndex((phase) => phase.clientId === sourceClientId);
      const targetIndex = current.findIndex((phase) => phase.clientId === targetClientId);
      if (sourceIndex === -1 || targetIndex === -1) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next.map((phase, index) => ({ ...phase, sortOrder: index }));
    });
  }

  function updateTieBreakerRow(clientId: string, changes: Partial<TieBreakerRow>) {
    setTieBreakerRows((current) => current.map((question, index) => (
      question.clientId === clientId ? { ...question, ...changes, sortOrder: changes.sortOrder ?? index } : question
    )));
  }

  function removeGroupRow(clientId: string) {
    setGroupRows((current) => current.filter((group) => group.clientId !== clientId).map((group, index) => ({ ...group, sortOrder: index })));
  }

  function removePhaseRow(clientId: string) {
    setPhaseRows((current) => current.filter((phase) => phase.clientId !== clientId).map((phase, index) => ({ ...phase, sortOrder: index })));
  }

  function removeTieBreakerRow(clientId: string) {
    setTieBreakerRows((current) => current.filter((question) => question.clientId !== clientId).map((question, index) => ({ ...question, sortOrder: index })));
  }

  function startEditingTeam(team: Team, rowKey?: string) {
    setEditingTeamId(team.id);
    setEditingTeamRowKey(rowKey ?? "");
    setTeamName(team.name);
    setTeamCode(team.fifaCode);
    setTeamGroupId(team.groupMemberships[0]?.group.id ?? "");
    setTeamSeed(String(team.groupMemberships[0]?.seed ?? 0));
  }

  function startCreatingTeam(groupId: string, seed: number) {
    setEditingTeamId("");
    setEditingTeamRowKey(`${groupId}:${seed}`);
    setTeamName("");
    setTeamCode("");
    setTeamGroupId(groupId);
    setTeamSeed(String(seed));
  }

  function startEditingUser(user: AdminUser) {
    setEditingUserId(user.id);
    setUserName(user.name ?? "");
    setUserEmail(user.email ?? "");
    setUserRole(user.role);
    setModal({ type: "user" });
  }

  async function saveTeamRow() {
    setMessage("");
    setError("");

    const res = await fetch(editingTeamId ? `/api/admin/teams/${editingTeamId}` : "/api/admin/teams", {
      method: editingTeamId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId: tournament?.id ?? null, name: teamName, fifaCode: teamCode, groupId: teamGroupId || null, seed: Number(teamSeed) }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not save team.");
      return;
    }

    resetTeamForm();
    setMessage(editingTeamId ? "Team updated." : "Team created.");
    await loadTeams();
  }

  async function deleteTeam(teamId: string) {
    setMessage("");
    setError("");

    const res = await fetch(`/api/admin/teams/${teamId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not delete team.");
      return;
    }

    if (editingTeamId === teamId) {
      resetTeamForm();
    }
    setMessage("Team deleted.");
    await loadTeams();
  }

  async function saveUser(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    const res = await fetch(editingUserId ? `/api/admin/users/${editingUserId}` : "/api/admin/users", {
      method: editingUserId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: userName,
        email: userEmail,
        role: userRole,
        password: userPassword,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not save user.");
      return;
    }

    resetUserForm();
    setMessage(editingUserId ? "User updated." : "User created.");
    await loadUsers();
    setModal(null);
  }

  async function deleteMatch(matchId: string) {
    setMessage("");
    setError("");
    const res = await fetch(`/api/admin/matches/${matchId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not delete match.");
    } else {
      setMessage("Match deleted.");
      await loadMatches();
    }
    setModal(null);
  }

  async function deleteUser(userId: string) {
    setMessage("");
    setError("");

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not delete user.");
      return;
    }

    if (editingUserId === userId) {
      resetUserForm();
    }
    setMessage("User deleted.");
    await loadUsers();
    setModal(null);
  }

  async function saveSponsoredPlacement(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    const res = await fetch(editingSponsoredId ? `/api/admin/sponsored/${editingSponsoredId}` : "/api/admin/sponsored", {
      method: editingSponsoredId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: tournament?.id ?? null,
        title: sponsoredTitle,
        summary: sponsoredSummary,
        imageUrl: sponsoredImageUrl,
        targetUrl: sponsoredTargetUrl,
        ctaLabel: sponsoredCtaLabel,
        sponsorName: sponsoredSponsorName,
        badgeLabel: sponsoredBadgeLabel,
        priority: Number(sponsoredPriority),
        isActive: sponsoredIsActive,
        activeFrom: sponsoredActiveFrom ? new Date(sponsoredActiveFrom).toISOString() : null,
        activeTo: sponsoredActiveTo ? new Date(sponsoredActiveTo).toISOString() : null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not save sponsored placement.");
      return;
    }

    resetSponsoredForm();
    setMessage(editingSponsoredId ? "Sponsored placement updated." : "Sponsored placement created.");
    await loadSponsoredPlacements();
    setModal(null);
  }

  async function deleteSponsoredPlacement(placementId: string) {
    setMessage("");
    setError("");

    const res = await fetch(`/api/admin/sponsored/${placementId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not delete sponsored placement.");
      return;
    }

    setMessage("Sponsored placement deleted.");
    await loadSponsoredPlacements();
    setModal(null);
  }

  function openCreateUserModal() {
    resetUserForm();
    setModal({ type: "user" });
  }

  function openCreateSponsoredModal() {
    resetSponsoredForm();
    setModal({ type: "sponsored" });
  }

  function startEditingSponsored(placement: SponsoredPlacement) {
    setEditingSponsoredId(placement.id);
    setSponsoredTitle(placement.title);
    setSponsoredSummary(placement.summary ?? "");
    setSponsoredImageUrl(placement.imageUrl ?? "");
    setSponsoredTargetUrl(placement.targetUrl);
    setSponsoredCtaLabel(placement.ctaLabel ?? "");
    setSponsoredSponsorName(placement.sponsorName ?? "");
    setSponsoredBadgeLabel(placement.badgeLabel);
    setSponsoredPriority(String(placement.priority));
    setSponsoredActiveFrom(placement.activeFrom ? new Date(placement.activeFrom).toISOString().slice(0, 16) : "");
    setSponsoredActiveTo(placement.activeTo ? new Date(placement.activeTo).toISOString().slice(0, 16) : "");
    setSponsoredIsActive(placement.isActive);
    setModal({ type: "sponsored" });
  }

  async function addMatch(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    const res = await fetch(editingMatchId ? `/api/admin/matches/${editingMatchId}` : "/api/admin/matches", {
      method: editingMatchId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: tournament?.id ?? null,
        phaseId: matchPhaseId,
        groupId: matchGroupId || null,
        label: matchLabel || null,
        homeTeamId: homeSourceType === "TEAM" ? homeTeamId || null : null,
        awayTeamId: awaySourceType === "TEAM" ? awayTeamId || null : null,
        homePlaceholder: homeSourceType === "PLACEHOLDER" ? homePlaceholder || null : null,
        awayPlaceholder: awaySourceType === "PLACEHOLDER" ? awayPlaceholder || null : null,
        homeSourceType,
        awaySourceType,
        homeSourceGroupId: homeSourceType === "GROUP_POSITION" ? homeSourceGroupId || null : null,
        awaySourceGroupId: awaySourceType === "GROUP_POSITION" ? awaySourceGroupId || null : null,
        homeSourcePosition: homeSourceType === "GROUP_POSITION" ? Number(homeSourcePosition) : null,
        awaySourcePosition: awaySourceType === "GROUP_POSITION" ? Number(awaySourcePosition) : null,
        homeSourceMatchId: homeSourceType === "MATCH_RESULT" ? homeSourceMatchId || null : null,
        awaySourceMatchId: awaySourceType === "MATCH_RESULT" ? awaySourceMatchId || null : null,
        homeSourceOutcome: homeSourceType === "MATCH_RESULT" ? homeSourceOutcome : null,
        awaySourceOutcome: awaySourceType === "MATCH_RESULT" ? awaySourceOutcome : null,
        homeSourceThirdRank: homeSourceType === "BEST_THIRD" ? Number(homeSourceThirdRank) : null,
        awaySourceThirdRank: awaySourceType === "BEST_THIRD" ? Number(awaySourceThirdRank) : null,
        homeSourceThirdGroups: homeSourceType === "BEST_THIRD" ? homeSourceThirdGroups || null : null,
        awaySourceThirdGroups: awaySourceType === "BEST_THIRD" ? awaySourceThirdGroups || null : null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? `Could not ${editingMatchId ? "update" : "create"} match.`);
      return;
    }

    resetMatchForm();
    setMessage(editingMatchId ? "Match updated." : "Match created.");
    await loadMatches();
  }

  async function setResult(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    const res = await fetch(`/api/admin/matches/${resultMatchId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeScore, awayScore }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not update result.");
      return;
    }

    setResultMatchId("");
    setHomeScore(0);
    setAwayScore(0);
    setMessage("Match result updated.");
    await loadMatches();
  }

  async function saveTieBreakerAnswer(questionId: string) {
    setMessage("");
    setError("");

    const res = await fetch(`/api/admin/tournament/tiebreakers/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correctAnswer: tieBreakerAnswers[questionId] ?? "" }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not update tie-breaker answer.");
      return;
    }

    setMessage("Tie-breaker answer updated.");
    await loadTournament();
  }

  async function resolveBracketParticipants() {
    setMessage("");
    setError("");

    const res = await fetch("/api/admin/tournament/resolve-bracket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId: tournament?.id ?? null }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not resolve bracket participants.");
      return;
    }

    const data = await res.json().catch(() => null);
    setMessage(data?.message ?? "Bracket participants resolved.");
    await loadMatches();
  }

  return (
    <div className="-mx-4 -mt-5 md:-mx-6 lg:-mx-8">
      {/* Operator chrome header */}
      <div
        className="row pad-4"
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--ink)",
          color: "#fff",
          borderBottom: "1px solid #1f2937",
        }}
      >
        <div className="row gap-3" style={{ alignItems: "center" }}>
          <span className="chip" style={{ background: "var(--gold)", color: "#0c1118", fontWeight: 800, letterSpacing: "0.12em" }}>
            ADMIN
          </span>
          <span className="bold text-md" style={{ color: "#fff" }}>Control Room</span>
          <span className="text-xs mono" style={{ color: "#94a3b8", letterSpacing: "0.16em" }}>· Tournament management &amp; configuration</span>
        </div>
        <div className="row gap-3" style={{ alignItems: "center" }}>
          <button
            className="btn btn-sm btn-accent"
            onClick={startNewTournament}
            type="button"
          >
            New tournament
          </button>
          <Link
            href="/dashboard"
            className="btn btn-sm"
            style={{ background: "transparent", borderColor: "#334155", color: "#94a3b8" }}
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="space-y-6" style={{ padding: "24px" }}>

      {message ? <div className="rounded-[1.5rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--accent-soft)" }}>{message}</div> : null}
      {error ? <div className="rounded-[1.5rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="surface rounded-[2rem] p-6 md:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Tournaments</p>
              <h3 className="mt-2 text-3xl font-extrabold">Roster</h3>
            </div>
            <button className="rounded-[1.1rem] border px-4 py-3 text-xs font-extrabold uppercase tracking-[0.18em]" onClick={startNewTournament} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
              New
            </button>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {tournaments.map((item) => (
              <article key={item.id} className="rounded-[1.4rem] border p-4" style={{ borderColor: tournament?.id === item.id ? "var(--accent)" : "var(--border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{item.name}</p>
                    <p className="mt-1 text-xs muted">{item.slug}</p>
                  </div>
                  <span className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: item.archivedAt ? "var(--bg-strong)" : "var(--accent-soft)", color: item.archivedAt ? "var(--muted)" : "var(--accent-strong)" }}>
                    {item.archivedAt ? "Archived" : item.isActive ? "Active" : "Draft"}
                  </span>
                </div>
                <p className="mt-3 text-sm muted">{item.description || "No description yet."}</p>
                {item.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]"
                        style={{ background: "var(--bg-strong)", color: "var(--accent-strong)" }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="mt-3 text-xs muted">
                  {item.type === "STAGED"
                    ? <>{item._count.stages} stages • {item._count.groupRooms} group rooms</>
                    : <>{item._count.groups} groups • {item._count.phases} phases • {item._count.matches} matches • {item._count.groupRooms} group rooms</>
                  }
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" onClick={() => void editTournament(item.id)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                    Edit
                  </button>
                  <Link className="rounded-[0.9rem] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" href={`/dashboard/admin/tournament?tournamentId=${item.id}`} style={{ background: "var(--accent)", color: "var(--accent-fg, #fff)" }}>
                    Manage Results
                  </Link>
                  {item.type === "STAGED" ? (
                    <Link className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" href={`/dashboard/admin/tournaments/${item.id}/staged`} style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                      Manage Stages →
                    </Link>
                  ) : null}
                  {item.archivedAt ? (
                    <button className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" onClick={() => setModal({ type: "archiveTournament", tournament: item })} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                      Restore
                    </button>
                  ) : (
                    <button className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" onClick={() => setModal({ type: "archiveTournament", tournament: item })} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                      Archive
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Users</p>
          <h3 className="mt-2 text-3xl font-extrabold">Access control</h3>
          <div className="mt-5 space-y-4">
            <p className="text-sm muted">Create accounts, promote users to admin, or remove users from the system. Self-registration still defaults to `USER`.</p>
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm font-bold">{users.filter((user) => user.role === "ADMIN").length} admins</p>
              <p className="mt-1 text-sm muted">{users.length} total accounts</p>
            </div>
            <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white" onClick={openCreateUserModal} style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="button">
              Create user
            </button>
          </div>
        </div>
      </section>

      <section className="surface rounded-[2rem] p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Sponsored</p>
            <h3 className="mt-2 text-3xl font-extrabold">Newsroom placements</h3>
          </div>
          <button className="rounded-[1.1rem] border px-4 py-3 text-xs font-extrabold uppercase tracking-[0.18em]" onClick={openCreateSponsoredModal} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
            New placement
          </button>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {sponsoredPlacements.length > 0 ? sponsoredPlacements.map((placement) => (
            <article key={placement.id} className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold">{placement.title}</p>
                  <p className="mt-1 text-xs muted">{placement.sponsorName || placement.badgeLabel}</p>
                </div>
                <span className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: placement.isActive ? "var(--accent-soft)" : "var(--bg-strong)", color: placement.isActive ? "var(--accent-strong)" : "var(--muted)" }}>
                  {placement.isActive ? "Active" : "Paused"}
                </span>
              </div>
              <p className="mt-3 text-sm muted">{placement.summary || "No summary"}</p>
              <p className="mt-3 text-xs muted">Priority {placement.priority} • {placement.ctaLabel || "Open sponsor"} • {placement.targetUrl}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" onClick={() => startEditingSponsored(placement)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                  Edit
                </button>
                <button className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" onClick={() => setModal({ type: "deleteSponsored", placement })} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                  Delete
                </button>
              </div>
            </article>
          )) : (
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-lg font-bold">No sponsored placements</p>
              <p className="mt-2 text-sm muted">Create sponsored cards for the selected tournament newsroom. They will be clearly labeled and inserted into the feed at controlled intervals.</p>
            </div>
          )}
        </div>
      </section>

      {modal?.type === "tournament" ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/50 p-4 md:p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="surface flex items-center justify-between rounded-[2rem] p-5 md:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Tournament editor</p>
                <h3 className="mt-2 text-3xl font-extrabold">{tournament?.id ? tournamentName || "Edit tournament" : "Create tournament"}</h3>
              </div>
              <button className="rounded-[1.1rem] border px-4 py-3 text-xs font-extrabold uppercase tracking-[0.18em]" onClick={() => setModal(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                Close
              </button>
            </div>

            <CollapsibleSection defaultOpen description="Tournament basics, groups, phases, and tie-breakers." title="Structure">
              <form onSubmit={saveTournament} className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Active tournament</p>
            <input className="field" placeholder="Tournament name" value={tournamentName} onChange={(event) => setTournamentName(event.target.value)} />
            <input className="field" placeholder="Slug" value={slug} onChange={(event) => setSlug(event.target.value)} />
            <textarea className="field min-h-[7rem]" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
            <input className="field" min={1} placeholder="Teams per group" type="number" value={teamsPerGroup} onChange={(event) => setTeamsPerGroup(event.target.value)} />
            <div>
              <label className="mb-1 block text-xs font-semibold muted">Submission deadline (optional)</label>
              <input className="field" type="datetime-local" value={submissionDeadline} onChange={(event) => setSubmissionDeadline(event.target.value)} />
              {submissionDeadline ? <p className="mt-1 text-xs muted">Locked: {new Date(submissionDeadline).toLocaleString()}</p> : <p className="mt-1 text-xs muted">No deadline set — submissions open indefinitely.</p>}
            </div>
            <div className="space-y-2">
              <input
                className="field"
                placeholder="Tags, separated by commas"
                value={tournamentTags}
                onChange={(event) => setTournamentTags(event.target.value)}
              />
              <p className="text-xs muted">
                Tags will later power tournament-specific newsroom feeds. Example: <code>world cup, fifa, usa 2026</code>
              </p>
            </div>
            <div className="space-y-2">
              <label className="mb-1 block text-xs font-semibold muted">Tournament type</label>
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="tournamentType"
                    value="CLASSIC"
                    checked={tournamentType === "CLASSIC"}
                    onChange={() => setTournamentType("CLASSIC")}
                  />
                  Classic
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="tournamentType"
                    value="STAGED"
                    checked={tournamentType === "STAGED"}
                    onChange={() => setTournamentType("STAGED")}
                  />
                  Staged
                </label>
              </div>
              {tournamentType === "STAGED" ? (
                <p className="text-xs muted">Predictions are made in sequential stages. You will define and open each stage manually as real-world results become available.</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Groups</p>
                <button
                  className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                  style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                  onClick={() => setGroupRows((current) => [...current, { clientId: createClientId("group"), name: "", sortOrder: current.length }])}
                  type="button"
                >
                  Add group
                </button>
              </div>
              <div className="space-y-3">
                {groupRows.map((group, index) => (
                  <div key={group.clientId} className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] muted">#{index + 1}</span>
                    <input className="field" placeholder="Group name" value={group.name} onChange={(event) => updateGroupRow(group.clientId, { name: event.target.value })} />
                    <button
                      className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                      onClick={() => removeGroupRow(group.clientId)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Phases</p>
                <button
                  className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                  style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                  onClick={() => setPhaseRows((current) => [...current, { clientId: createClientId("phase"), name: "", slug: "", sortOrder: current.length, isKnockout: false, teamCount: null }])}
                  type="button"
                >
                  Add phase
                </button>
              </div>
              <div className="space-y-3">
                {phaseRows.map((phase, index) => (
                  <div
                    key={phase.clientId}
                    className="rounded-[1rem] border p-3"
                    draggable
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={() => setDraggedPhaseClientId(phase.clientId)}
                    onDrop={() => {
                      movePhaseRow(draggedPhaseClientId, phase.clientId);
                      setDraggedPhaseClientId("");
                    }}
                    onDragEnd={() => setDraggedPhaseClientId("")}
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="grid gap-3 xl:grid-cols-[auto_1fr_1fr_9rem_auto_auto] xl:items-center">
                      <span className="cursor-grab text-xs font-bold uppercase tracking-[0.2em] muted">#{index + 1}</span>
                      <input
                        className="field"
                        placeholder="Phase name"
                        value={phase.name}
                        onChange={(event) => {
                          const name = event.target.value;
                          updatePhaseRow(phase.clientId, {
                            name,
                            slug: slugify(name),
                          });
                        }}
                      />
                      <input className="field" placeholder="phase-slug" readOnly value={phase.slug} />
                      <input
                        className="field"
                        min={2}
                        placeholder="Teams"
                        type="number"
                        value={phase.teamCount ?? ""}
                        onChange={(event) => updatePhaseRow(phase.clientId, { teamCount: event.target.value ? Number(event.target.value) : null })}
                      />
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input checked={phase.isKnockout} onChange={(event) => updatePhaseRow(phase.clientId, { isKnockout: event.target.checked })} type="checkbox" />
                        Knockout
                      </label>
                      <button
                        className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                        onClick={() => removePhaseRow(phase.clientId)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                    <p className="mt-3 text-xs muted">Drag to reorder. Team count is explicit so each phase can reflect the intended bracket size instead of relying on naming conventions.</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Tie-breakers</p>
                <button
                  className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                  style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                  onClick={() => setTieBreakerRows((current) => [...current, { clientId: createClientId("tiebreaker"), prompt: { en: "", es: "" }, type: "NUMBER", sortOrder: current.length, correctAnswer: "" }])}
                  type="button"
                >
                  Add tie-breaker
                </button>
              </div>
              <div className="space-y-3">
                {tieBreakerRows.map((question, index) => (
                  <div key={question.clientId} className="rounded-[1rem] border p-3" style={{ borderColor: "var(--border)" }}>
                    <div className="grid gap-3 xl:grid-cols-[auto_1fr_10rem_auto] xl:items-center">
                      <span className="text-xs font-bold uppercase tracking-[0.2em] muted">#{index + 1}</span>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-[0.16em] muted w-6 shrink-0">EN</span>
                          <input className="field flex-1" placeholder="Tie-breaker prompt (English)" value={question.prompt.en ?? ""} onChange={(event) => updateTieBreakerRow(question.clientId, { prompt: { ...question.prompt, en: event.target.value } })} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-[0.16em] muted w-6 shrink-0">ES</span>
                          <input className="field flex-1" placeholder="Pregunta de desempate (español)" value={question.prompt.es ?? ""} onChange={(event) => updateTieBreakerRow(question.clientId, { prompt: { ...question.prompt, es: event.target.value } })} />
                        </div>
                      </div>
                      <select className="field" value={question.type} onChange={(event) => updateTieBreakerRow(question.clientId, { type: event.target.value as TieBreakerRow["type"] })}>
                        <option value="NUMBER">Number</option>
                        <option value="TEXT">Text</option>
                      </select>
                      <button
                        className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                        onClick={() => removeTieBreakerRow(question.clientId)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white xl:col-span-2" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="submit">
            Save active tournament
          </button>
        </form>
      </CollapsibleSection>

      <div className="space-y-5">
        <CollapsibleSection defaultOpen description="Fill group slots, lock rows, and keep legacy teams visible." title="Teams">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="mt-2 text-3xl font-extrabold">Group tables</h3>
              <p className="mt-2 text-sm muted">Set the number of team slots per group in tournament settings, then lock teams into those rows. Existing teams already in the database are mapped into the structure below.</p>
            </div>
            <div className="rounded-[1.2rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
              {effectiveTeamsPerGroup} slots per group
            </div>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            {groupedTeamTables.map(({ group, rows }) => (
              <section key={group.id} className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{group.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] muted">{rows.filter((row) => row.entry).length} assigned</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {rows.map(({ slot, entry }) => {
                    const rowKey = `${group.id}:${slot}`;
                    const editingThisRow = editingTeamRowKey === rowKey;

                    return (
                      <div key={rowKey} className="rounded-[1rem] border p-3" style={{ borderColor: editingThisRow ? "var(--accent)" : "var(--border)", background: editingThisRow ? "var(--accent-soft)" : "var(--bg-strong)" }}>
                        <div className="grid gap-3 md:grid-cols-[auto_1.2fr_0.7fr_auto] md:items-center">
                          <span className="text-xs font-bold uppercase tracking-[0.2em] muted">#{slot + 1}</span>
                          {editingThisRow ? (
                            <>
                              <input className="field" placeholder="Team name" value={teamName} onChange={(event) => setTeamName(event.target.value)} />
                              <input className="field" placeholder="FIFA code" value={teamCode} onChange={(event) => setTeamCode(event.target.value.toUpperCase())} />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                                  onClick={() => void saveTeamRow()}
                                  style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                                  type="button"
                                >
                                  {editingTeamId ? "Lock changes" : "Lock team"}
                                </button>
                                <button
                                  className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                                  onClick={resetTeamForm}
                                  style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <p className="font-bold">{entry?.team.name ?? "Empty slot"}</p>
                                <p className="mt-1 text-xs muted">{entry ? entry.team.fifaCode : "Name and FIFA code required"}</p>
                              </div>
                              <p className="text-xs uppercase tracking-[0.18em] muted">{entry ? "Locked" : "Open"}</p>
                              <div className="flex flex-wrap gap-2">
                                {entry ? (
                                  <>
                                    <button
                                      className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                                      onClick={() => startEditingTeam(entry.team, rowKey)}
                                      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                                      type="button"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                                      onClick={() => void deleteTeam(entry.team.id)}
                                      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                                      type="button"
                                    >
                                      Delete
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                                    onClick={() => startCreatingTeam(group.id, slot)}
                                    style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                                    type="button"
                                  >
                                    Add
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {unassignedTeams.length > 0 ? (
            <section className="mt-6 rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm font-semibold">Unassigned existing teams</p>
              <p className="mt-1 text-sm muted">These teams exist in the database but are not mapped to a group in the selected tournament yet.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {unassignedTeams.map((team) => (
                  <div key={team.id} className="rounded-[1rem] border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                    <p className="font-bold">{team.name}</p>
                    <p className="mt-1 text-xs muted">{team.fifaCode}</p>
                    <p className="mt-2 text-xs muted">Assign this team by locking it into an empty slot above.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                        onClick={() => void deleteTeam(team.id)}
                        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection description="Create or edit fixtures with fixed teams, group positions, prior match sources, or placeholders." title="Matches">
        <form onSubmit={addMatch}>
          <div className="mt-5 space-y-4">
            {editingMatchId ? (
              <div className="rounded-[1.2rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
                Editing existing match. Save to update it, or cancel to switch back to create mode.
              </div>
            ) : null}
            <select className="field" value={matchPhaseId} onChange={(event) => setMatchPhaseId(event.target.value)}>
              <option value="">Select phase</option>
              {tournament?.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
            </select>
            <select className="field" value={matchGroupId} onChange={(event) => setMatchGroupId(event.target.value)}>
              <option value="">No group</option>
              {tournament?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <input className="field" placeholder="Label (optional)" value={matchLabel} onChange={(event) => setMatchLabel(event.target.value)} />
            <div className="rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="mb-3 text-sm font-bold">Home participant</p>
              <div className="space-y-3">
                <select className="field" value={homeSourceType} onChange={(event) => setHomeSourceType(event.target.value as Match["homeSourceType"])}>
                  <option value="TEAM">Fixed team</option>
                  <option value="GROUP_POSITION">Group position</option>
                  <option value="MATCH_RESULT">Prior match result</option>
                  <option value="PLACEHOLDER">Free placeholder</option>
                  <option value="BEST_THIRD">Best 3rd-place team</option>
                </select>
                {homeSourceType === "TEAM" ? (
                  <select className="field" value={homeTeamId} onChange={(event) => setHomeTeamId(event.target.value)}>
                    <option value="">{matchGroupId ? "Select team from group" : "Select team"}</option>
                    {availableMatchTeams.map((team) => <option key={team.id} value={team.id}>{team.name} ({team.fifaCode})</option>)}
                  </select>
                ) : null}
                {homeSourceType === "GROUP_POSITION" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <select className="field" value={homeSourceGroupId} onChange={(event) => setHomeSourceGroupId(event.target.value)}>
                      <option value="">Select group</option>
                      {tournament?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                    <select className="field" value={homeSourcePosition} onChange={(event) => setHomeSourcePosition(event.target.value)}>
                      <option value="1">1st place</option>
                      <option value="2">2nd place</option>
                      <option value="3">3rd place</option>
                      <option value="4">4th place</option>
                    </select>
                  </div>
                ) : null}
                {homeSourceType === "MATCH_RESULT" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <select className="field" value={homeSourceMatchId} onChange={(event) => setHomeSourceMatchId(event.target.value)}>
                      <option value="">Select source match</option>
                      {matches.map((match) => <option key={match.id} value={match.id}>{match.phase.name} - {match.label ?? match.id}</option>)}
                    </select>
                    <select className="field" value={homeSourceOutcome} onChange={(event) => setHomeSourceOutcome(event.target.value as "WINNER" | "LOSER")}>
                      <option value="WINNER">Winner</option>
                      <option value="LOSER">Loser</option>
                    </select>
                  </div>
                ) : null}
                {homeSourceType === "PLACEHOLDER" ? <input className="field" placeholder="Home placeholder" value={homePlaceholder} onChange={(event) => setHomePlaceholder(event.target.value)} /> : null}
                {homeSourceType === "BEST_THIRD" ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold muted">Rank (1 = best 3rd)</label>
                        <input className="field" type="number" min="1" value={homeSourceThirdRank} onChange={(event) => setHomeSourceThirdRank(event.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold muted">Groups to consider</label>
                        <select className="field" size={Math.min((tournament?.groups.length ?? 0) + 1, 6)} multiple value={homeSourceThirdGroups ? homeSourceThirdGroups.split(",").map((g) => g.trim()) : []} onChange={(event) => setHomeSourceThirdGroups(Array.from(event.target.selectedOptions).map((o) => o.value).join(", "))}>
                          {tournament?.groups.map((group) => <option key={group.id} value={group.name}>{group.name}</option>)}
                        </select>
                        <p className="mt-1 text-xs muted">Hold Ctrl/Cmd to select multiple. Leave empty for all groups.</p>
                      </div>
                    </div>
                    {homeSourceThirdGroups ? <p className="text-xs muted">Considering: {homeSourceThirdGroups}</p> : <p className="text-xs muted">Considering all groups.</p>}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="mb-3 text-sm font-bold">Away participant</p>
              <div className="space-y-3">
                <select className="field" value={awaySourceType} onChange={(event) => setAwaySourceType(event.target.value as Match["awaySourceType"])}>
                  <option value="TEAM">Fixed team</option>
                  <option value="GROUP_POSITION">Group position</option>
                  <option value="MATCH_RESULT">Prior match result</option>
                  <option value="PLACEHOLDER">Free placeholder</option>
                  <option value="BEST_THIRD">Best 3rd-place team</option>
                </select>
                {awaySourceType === "TEAM" ? (
                  <select className="field" value={awayTeamId} onChange={(event) => setAwayTeamId(event.target.value)}>
                    <option value="">{matchGroupId ? "Select team from group" : "Select team"}</option>
                    {availableMatchTeams.map((team) => <option key={team.id} value={team.id}>{team.name} ({team.fifaCode})</option>)}
                  </select>
                ) : null}
                {awaySourceType === "GROUP_POSITION" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <select className="field" value={awaySourceGroupId} onChange={(event) => setAwaySourceGroupId(event.target.value)}>
                      <option value="">Select group</option>
                      {tournament?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                    <select className="field" value={awaySourcePosition} onChange={(event) => setAwaySourcePosition(event.target.value)}>
                      <option value="1">1st place</option>
                      <option value="2">2nd place</option>
                      <option value="3">3rd place</option>
                      <option value="4">4th place</option>
                    </select>
                  </div>
                ) : null}
                {awaySourceType === "MATCH_RESULT" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <select className="field" value={awaySourceMatchId} onChange={(event) => setAwaySourceMatchId(event.target.value)}>
                      <option value="">Select source match</option>
                      {matches.map((match) => <option key={match.id} value={match.id}>{match.phase.name} - {match.label ?? match.id}</option>)}
                    </select>
                    <select className="field" value={awaySourceOutcome} onChange={(event) => setAwaySourceOutcome(event.target.value as "WINNER" | "LOSER")}>
                      <option value="WINNER">Winner</option>
                      <option value="LOSER">Loser</option>
                    </select>
                  </div>
                ) : null}
                {awaySourceType === "PLACEHOLDER" ? <input className="field" placeholder="Away placeholder" value={awayPlaceholder} onChange={(event) => setAwayPlaceholder(event.target.value)} /> : null}
                {awaySourceType === "BEST_THIRD" ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold muted">Rank (1 = best 3rd)</label>
                        <input className="field" type="number" min="1" value={awaySourceThirdRank} onChange={(event) => setAwaySourceThirdRank(event.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold muted">Groups to consider</label>
                        <select className="field" size={Math.min((tournament?.groups.length ?? 0) + 1, 6)} multiple value={awaySourceThirdGroups ? awaySourceThirdGroups.split(",").map((g) => g.trim()) : []} onChange={(event) => setAwaySourceThirdGroups(Array.from(event.target.selectedOptions).map((o) => o.value).join(", "))}>
                          {tournament?.groups.map((group) => <option key={group.id} value={group.name}>{group.name}</option>)}
                        </select>
                        <p className="mt-1 text-xs muted">Hold Ctrl/Cmd to select multiple. Leave empty for all groups.</p>
                      </div>
                    </div>
                    {awaySourceThirdGroups ? <p className="text-xs muted">Considering: {awaySourceThirdGroups}</p> : <p className="text-xs muted">Considering all groups.</p>}
                  </div>
                ) : null}
              </div>
            </div>
            <input className="field" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
            <div className="flex flex-wrap gap-3">
              <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="submit">
                {editingMatchId ? "Update match" : "Create match"}
              </button>
              {editingMatchId ? (
                <button
                  className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]"
                  style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
                  onClick={resetMatchForm}
                  type="button"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </div>
        </form>
        </CollapsibleSection>

      <CollapsibleSection description="Enter final scores and resolve bracket participants from completed matches." title="Results">
      <form onSubmit={setResult}>
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.8fr_auto]">
          <select className="field" value={resultMatchId} onChange={(event) => setResultMatchId(event.target.value)}>
            <option value="">Select match</option>
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.phase.name} - {match.homeTeam?.name ?? match.homePlaceholder ?? "TBD"} vs {match.awayTeam?.name ?? match.awayPlaceholder ?? "TBD"}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input className="field" type="number" value={homeScore} onChange={(event) => setHomeScore(Number(event.target.value))} />
            <input className="field" type="number" value={awayScore} onChange={(event) => setAwayScore(Number(event.target.value))} />
          </div>
          <button className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }} type="submit">
            Update
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white" onClick={() => void resolveBracketParticipants()} style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="button">
            Resolve bracket from groups
          </button>
          <p className="self-center text-sm muted">Structured sources are preferred. Free-text placeholders remain as a fallback for legacy slots.</p>
        </div>
      </form>
      </CollapsibleSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <CollapsibleSection description="Review the configured tournament structure and tie-breaker answers." title="Tournament Snapshot">
          {tournament ? (
            <div className="mt-5 space-y-4 text-sm">
              <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="font-extrabold">{tournament.name}</p>
                <p className="mt-1 muted">{tournament.description || "No description"}</p>
              </div>
              <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="font-semibold">Groups</p>
                <p className="mt-2 muted">{tournament.groups.map((group) => group.name).join(", ") || "None"}</p>
              </div>
              <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="font-semibold">Phases</p>
                <p className="mt-2 muted">{tournament.phases.map((phase) => `${phase.name}${phase.teamCount ? ` (${phase.teamCount})` : ""}`).join(", ") || "None"}</p>
              </div>
              <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="font-semibold">Tie-breaker answers</p>
                <div className="mt-3 space-y-3">
                  {tournament.tieBreakers.length === 0 ? <p className="muted">No tie-breakers configured.</p> : tournament.tieBreakers.map((question) => (
                    <div key={question.id} className="rounded-[1rem] border p-3" style={{ borderColor: "var(--border)" }}>
                      <p className="text-sm font-bold">{question.prompt["en"] ?? Object.values(question.prompt)[0] ?? ""}</p>
                      <div className="mt-3 flex flex-col gap-3 md:flex-row">
                        <input
                          className="field"
                          type={question.type === "NUMBER" ? "number" : "text"}
                          value={tieBreakerAnswers[question.id] ?? ""}
                          onChange={(event) => setTieBreakerAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                        />
                        <button className="rounded-[1rem] border px-4 py-3 text-sm font-bold" onClick={() => void saveTieBreakerAnswer(question.id)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                          Save answer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : <p className="mt-5 muted">No active tournament configured.</p>}
        </CollapsibleSection>
        <CollapsibleSection description="Quick inventory of the current tournament’s allocations and fixtures." title="Current Assets">
          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="font-semibold">Team allocation</p>
              <p className="mt-2 muted">{teams.filter((team) => getTournamentMembership(team, currentTournamentId)).length} assigned • {unassignedTeams.length} unassigned • {effectiveTeamsPerGroup} slots per group</p>
            </div>
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="font-semibold">Matches</p>
              <p className="mt-2 muted">{matches.length} created</p>
              <div className="mt-3 space-y-2">
                {matches.slice(0, 6).map((match) => (
                  <div key={match.id} className="rounded-[1rem] border p-3" style={{ borderColor: "var(--border)" }}>
                    <p className="font-bold">{match.phase.name}: {match.homeTeam?.name ?? match.homePlaceholder ?? "TBD"} vs {match.awayTeam?.name ?? match.awayPlaceholder ?? "TBD"}</p>
                    <p className="mt-1 text-xs muted">Home source: {match.homeSourceType} • Away source: {match.awaySourceType}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                        onClick={() => startEditingMatch(match)}
                        type="button"
                      >
                        Edit
                      </button>
                      {match.status !== "FINISHED" && (
                        <button
                          className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]"
                          style={{ borderColor: "var(--border)", color: "var(--danger)", background: "var(--bg)" }}
                          onClick={() => setModal({ type: "deleteMatch", match })}
                          type="button"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </div>
      </div>
          </div>
        </div>
      ) : null}

      <section className="surface rounded-[2rem] p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Users</p>
            <h3 className="mt-2 text-3xl font-extrabold">Directory</h3>
          </div>
          <button className="rounded-[1.1rem] border px-4 py-3 text-xs font-extrabold uppercase tracking-[0.18em]" onClick={openCreateUserModal} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
            Create user
          </button>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {users.map((user) => (
            <article key={user.id} className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold">{user.name || "Unnamed user"}</p>
                  <p className="mt-1 text-sm muted">{user.email || "No email"}</p>
                </div>
                <span className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: user.role === "ADMIN" ? "var(--accent-soft)" : "var(--bg-strong)", color: user.role === "ADMIN" ? "var(--accent-strong)" : "var(--muted)" }}>
                  {user.role}
                </span>
              </div>
              <p className="mt-3 text-xs muted">{user._count.predictions} predictions • {user._count.memberships} memberships • {user._count.submissions} submissions</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" onClick={() => startEditingUser(user)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                  Edit
                </button>
                <button className="rounded-[0.9rem] border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" onClick={() => setModal({ type: "deleteUser", user })} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface rounded-[2rem] p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Groups</p>
            <h3 className="mt-2 text-3xl font-extrabold">Portal rooms</h3>
            <p className="mt-2 text-sm muted">Every group created in the portal, across all tournaments.</p>
          </div>
          <div className="flex items-center gap-2">
            {groupRooms.some((g) => g.status === "PENDING") ? (
              <span className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: "#fef3c7", color: "#92400e" }}>
                {groupRooms.filter((g) => g.status === "PENDING").length} pending
              </span>
            ) : null}
            <span className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: "var(--bg-strong)", color: "var(--muted)" }}>
              {groupRooms.length} total
            </span>
          </div>
        </div>
        {groupRooms.length === 0 ? (
          <p className="mt-5 text-sm muted">No groups have been created yet.</p>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {[...groupRooms]
              .sort((a, b) => (a.status === "PENDING" ? 0 : 1) - (b.status === "PENDING" ? 0 : 1))
              .map((group) => {
              const statusStyle =
                group.status === "PENDING"
                  ? { background: "#fef3c7", color: "#92400e", label: "Pending" }
                  : group.status === "REJECTED"
                  ? { background: "#fee2e2", color: "#991b1b", label: "Rejected" }
                  : { background: "var(--accent-soft)", color: "var(--accent-strong)", label: "Approved" };
              return (
              <article key={group.id} className="rounded-[1.3rem] border p-4" style={{ borderColor: group.status === "PENDING" ? "#f59e0b" : "var(--border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{group.name}</p>
                    <p className="mt-1 text-sm muted">{group.owner.name || group.owner.email || "Unknown owner"}</p>
                  </div>
                  <span className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: statusStyle.background, color: statusStyle.color }}>
                    {statusStyle.label}
                  </span>
                </div>
                {group.description ? <p className="mt-3 text-sm muted">{group.description}</p> : null}
                <p className="mt-3 text-xs muted">{group.tournament ? group.tournament.name : "No tournament"} • {group._count.memberships} members • {group._count.submissions} submissions • code {group.inviteCode}</p>
                <p className="mt-1 text-xs muted">Created {new Date(group.createdAt).toLocaleDateString()}</p>
                {group.status !== "APPROVED" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void setGroupStatus(group.id, "APPROVED")}
                      className="rounded-[1rem] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-white"
                      style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                    >
                      Approve
                    </button>
                    {group.status === "PENDING" ? (
                      <button
                        type="button"
                        onClick={() => void setGroupStatus(group.id, "REJECTED")}
                        className="rounded-[1rem] border px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em]"
                        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                      >
                        Reject
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
              );
            })}
          </div>
        )}
      </section>

      {modal?.type === "user" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveUser} className="surface w-full max-w-xl rounded-[2rem] p-6 md:p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">User</p>
                <h3 className="mt-2 text-3xl font-extrabold">{editingUserId ? "Edit user" : "Create user"}</h3>
              </div>
              <button className="rounded-[1.1rem] border px-4 py-3 text-xs font-extrabold uppercase tracking-[0.18em]" onClick={() => setModal(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                Close
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <input className="field" placeholder="Display name" value={userName} onChange={(event) => setUserName(event.target.value)} />
              <input className="field" placeholder="Email" type="email" value={userEmail} onChange={(event) => setUserEmail(event.target.value.toLowerCase())} />
              <input className="field" placeholder={editingUserId ? "New password (optional)" : "Password"} type="password" value={userPassword} onChange={(event) => setUserPassword(event.target.value)} />
              <select className="field" value={userRole} onChange={(event) => setUserRole(event.target.value as "USER" | "ADMIN")}>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="submit">
                  {editingUserId ? "Save changes" : "Create user"}
                </button>
                <button className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]" onClick={() => setModal(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {modal?.type === "sponsored" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveSponsoredPlacement} className="surface w-full max-w-2xl rounded-[2rem] p-6 md:p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Sponsored</p>
                <h3 className="mt-2 text-3xl font-extrabold">{editingSponsoredId ? "Edit placement" : "Create placement"}</h3>
              </div>
              <button className="rounded-[1.1rem] border px-4 py-3 text-xs font-extrabold uppercase tracking-[0.18em]" onClick={() => setModal(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                Close
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <input className="field" placeholder="Title" value={sponsoredTitle} onChange={(event) => setSponsoredTitle(event.target.value)} />
              <textarea className="field min-h-[7rem]" placeholder="Summary" value={sponsoredSummary} onChange={(event) => setSponsoredSummary(event.target.value)} />
              <input className="field" placeholder="Image URL" value={sponsoredImageUrl} onChange={(event) => setSponsoredImageUrl(event.target.value)} />
              <input className="field" placeholder="Target URL" value={sponsoredTargetUrl} onChange={(event) => setSponsoredTargetUrl(event.target.value)} />
              <div className="grid gap-4 md:grid-cols-2">
                <input className="field" placeholder="CTA label" value={sponsoredCtaLabel} onChange={(event) => setSponsoredCtaLabel(event.target.value)} />
                <input className="field" placeholder="Sponsor name" value={sponsoredSponsorName} onChange={(event) => setSponsoredSponsorName(event.target.value)} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <input className="field" placeholder="Badge label" value={sponsoredBadgeLabel} onChange={(event) => setSponsoredBadgeLabel(event.target.value)} />
                <input className="field" placeholder="Priority" type="number" value={sponsoredPriority} onChange={(event) => setSponsoredPriority(event.target.value)} />
                <label className="flex items-center gap-2 rounded-[1rem] border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                  <input checked={sponsoredIsActive} onChange={(event) => setSponsoredIsActive(event.target.checked)} type="checkbox" />
                  Active
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <input className="field" type="datetime-local" value={sponsoredActiveFrom} onChange={(event) => setSponsoredActiveFrom(event.target.value)} />
                <input className="field" type="datetime-local" value={sponsoredActiveTo} onChange={(event) => setSponsoredActiveTo(event.target.value)} />
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="submit">
                  {editingSponsoredId ? "Save placement" : "Create placement"}
                </button>
                <button className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]" onClick={() => setModal(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {modal?.type === "archiveTournament" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="surface w-full max-w-lg rounded-[2rem] p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Tournament</p>
            <h3 className="mt-2 text-3xl font-extrabold">{modal.tournament.archivedAt ? "Restore tournament?" : "Archive tournament?"}</h3>
            <p className="mt-4 text-base muted">{modal.tournament.name}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                onClick={() => void updateTournamentStatus(modal.tournament.id, modal.tournament.archivedAt ? "restore" : "archive")}
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                type="button"
              >
                {modal.tournament.archivedAt ? "Restore" : "Archive"}
              </button>
              <button className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]" onClick={() => setModal(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal?.type === "deleteMatch" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="surface w-full max-w-lg rounded-[2rem] p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Match</p>
            <h3 className="mt-2 text-3xl font-extrabold">Delete match?</h3>
            <p className="mt-4 text-base muted">{modal.match.phase.name}: {modal.match.homeTeam?.name ?? modal.match.homePlaceholder ?? "TBD"} vs {modal.match.awayTeam?.name ?? modal.match.awayPlaceholder ?? "TBD"}</p>
            <p className="mt-2 text-sm muted">This will also remove all prediction entries for this match.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                onClick={() => void deleteMatch(modal.match.id)}
                style={{ background: "linear-gradient(135deg, var(--danger), #9f2c2c)" }}
                type="button"
              >
                Delete
              </button>
              <button className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]" onClick={() => setModal(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal?.type === "deleteUser" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="surface w-full max-w-lg rounded-[2rem] p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">User</p>
            <h3 className="mt-2 text-3xl font-extrabold">Delete account?</h3>
            <p className="mt-4 text-base muted">{modal.user.name || modal.user.email || "Unknown user"}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                onClick={() => void deleteUser(modal.user.id)}
                style={{ background: "linear-gradient(135deg, var(--danger), #9f2c2c)" }}
                type="button"
              >
                Delete
              </button>
              <button className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]" onClick={() => setModal(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal?.type === "deleteSponsored" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="surface w-full max-w-lg rounded-[2rem] p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Sponsored</p>
            <h3 className="mt-2 text-3xl font-extrabold">Delete placement?</h3>
            <p className="mt-4 text-base muted">{modal.placement.title}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                onClick={() => void deleteSponsoredPlacement(modal.placement.id)}
                style={{ background: "linear-gradient(135deg, var(--danger), #9f2c2c)" }}
                type="button"
              >
                Delete
              </button>
              <button className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]" onClick={() => setModal(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </div>
  );
}
