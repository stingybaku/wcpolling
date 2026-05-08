"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/lib/navigation";
import { flagEmoji } from "@/lib/fifa-flags";
import {
  lookupThirdPlaceScenario,
  THIRD_PLACE_MATCH_SLOTS,
} from "@/lib/third-place-scenarios";

// ─── Types ───────────────────────────────────────────────────────────────────

type Team = { id: string; name: string; fifaCode: string };

type TournamentGroup = {
  id: string;
  name: string;
  sortOrder: number;
  teams: { team: Team }[];
};

type TournamentPhase = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isKnockout: boolean;
};

type Match = {
  id: string;
  label?: string | null;
  sortOrder: number;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
  phase: TournamentPhase;
  group?: { id: string; name: string } | null;
  homeTeam?: Team | null;
  awayTeam?: Team | null;
  homeSourceGroup?: { name: string } | null;
  awaySourceGroup?: { name: string } | null;
  homeSourceType: string;
  awaySourceType: string;
  homeSourcePosition?: number | null;
  awaySourcePosition?: number | null;
};

type OfficialGroupStanding = { groupId: string; teamId: string; position: number };
type OfficialThirdPlace = { teamId: string; rank: number };

type Tournament = {
  id: string;
  name: string;
  groups: TournamentGroup[];
  phases: TournamentPhase[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupLabel(match: Match) {
  if (match.homeTeam && match.awayTeam) {
    return `${flagEmoji(match.homeTeam.fifaCode)} ${match.homeTeam.name} vs ${flagEmoji(match.awayTeam.fifaCode)} ${match.awayTeam.name}`;
  }
  const home = match.homeTeam?.name ?? (match.homeSourceGroup ? `1st ${match.homeSourceGroup.name}` : "TBD");
  const away = match.awayTeam?.name ?? (match.awaySourceGroup ? `${match.awaySourcePosition}nd ${match.awaySourceGroup.name}` : "TBD");
  return `${home} vs ${away}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminTournamentPage() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [officialGroupStandings, setOfficialGroupStandings] = useState<OfficialGroupStanding[]>([]);
  const [officialThirdPlace, setOfficialThirdPlace] = useState<OfficialThirdPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSuccessMsg] = useState("");

  // ── Step tracking ──────────────────────────────────────────────────────────
  // Step 0 = Groups, Step 1 = Third Place, Step 2..N = knockout phases
  const [step, setStep] = useState(0);

  // ── Group standings drag state ─────────────────────────────────────────────
  const [groupStandings, setGroupStandings] = useState<Record<string, string[]>>({});
  const dragGroupRef = useRef<{ groupId: string; fromIdx: number } | null>(null);

  // ── Third-place drag state ─────────────────────────────────────────────────
  const [thirdPlaceRanking, setThirdPlaceRanking] = useState<string[]>([]);
  const dragThirdRef = useRef<number | null>(null);

  // ── Match score state ──────────────────────────────────────────────────────
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({});

  // ─── Load ──────────────────────────────────────────────────────────────────
  const loadState = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/tournament/state");
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    if (!data.tournament) { setLoading(false); return; }

    setTournament(data.tournament);
    setMatches(data.matches ?? []);
    setOfficialGroupStandings(data.officialGroupStandings ?? []);
    setOfficialThirdPlace(data.officialThirdPlace ?? []);

    // Initialise group standings state
    const groups: TournamentGroup[] = data.tournament.groups ?? [];
    const officialByGroup = new Map<string, string[]>();
    for (const s of (data.officialGroupStandings ?? []) as OfficialGroupStanding[]) {
      const arr = officialByGroup.get(s.groupId) ?? [];
      arr[s.position - 1] = s.teamId;
      officialByGroup.set(s.groupId, arr);
    }
    const initial: Record<string, string[]> = {};
    for (const g of groups) {
      initial[g.id] = officialByGroup.get(g.id) ?? g.teams.map((t) => t.team.id);
    }
    setGroupStandings(initial);

    // Initialise third-place ranking
    const official3rd = (data.officialThirdPlace ?? []) as OfficialThirdPlace[];
    if (official3rd.length > 0) {
      setThirdPlaceRanking(official3rd.map((r) => r.teamId));
    } else {
      // Default: position-3 team from each group in group sort order
      setThirdPlaceRanking(groups.map((g) => {
        const standing = officialByGroup.get(g.id) ?? g.teams.map((t) => t.team.id);
        return standing[2] ?? "";
      }).filter(Boolean));
    }

    // Initialise scores from existing match results
    const scoreInit: Record<string, { home: string; away: string }> = {};
    for (const m of (data.matches ?? []) as Match[]) {
      if (m.homeScore != null && m.awayScore != null) {
        scoreInit[m.id] = { home: String(m.homeScore), away: String(m.awayScore) };
      }
    }
    setScores(scoreInit);

    setLoading(false);
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  // ─── Derived data ──────────────────────────────────────────────────────────
  const knockoutPhases = (tournament?.phases ?? [])
    .filter((p) => p.isKnockout)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const totalSteps = 2 + knockoutPhases.length; // 0=groups, 1=third, 2..N=knockout
  const currentPhase = step >= 2 ? knockoutPhases[step - 2] : null;
  const currentPhaseMatches = currentPhase
    ? matches.filter((m) => m.phase.id === currentPhase.id).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const allTeamsById = new Map<string, Team>();
  for (const g of tournament?.groups ?? []) {
    for (const { team } of g.teams) allTeamsById.set(team.id, team);
  }

  // ─── Group drag handlers ───────────────────────────────────────────────────
  function moveGroupTeam(groupId: string, fromIdx: number, toIdx: number) {
    setGroupStandings((prev) => {
      const arr = [...(prev[groupId] ?? [])];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return { ...prev, [groupId]: arr };
    });
  }

  // ─── Third-place drag handlers ─────────────────────────────────────────────
  function moveThirdPlace(fromIdx: number, toIdx: number) {
    setThirdPlaceRanking((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
  }

  // ─── Save helpers ──────────────────────────────────────────────────────────
  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  async function saveGroupStandings() {
    if (!tournament) return;
    setSaving(true); setSaveError("");
    const standings: OfficialGroupStanding[] = [];
    for (const [groupId, teamIds] of Object.entries(groupStandings)) {
      teamIds.forEach((teamId, i) => standings.push({ groupId, teamId, position: i + 1 }));
    }
    const res = await fetch("/api/admin/tournament/standings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId: tournament.id, standings }),
    });
    setSaving(false);
    if (!res.ok) { setSaveError("Failed to save group standings"); return; }
    flash("Group standings saved & bracket resolved.");
    await loadState();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStep(1);
  }

  async function saveThirdPlace() {
    if (!tournament) return;
    setSaving(true); setSaveError("");
    const res = await fetch("/api/admin/tournament/third-place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId: tournament.id, teamIds: thirdPlaceRanking }),
    });
    setSaving(false);
    if (!res.ok) { setSaveError("Failed to save third-place rankings"); return; }
    flash("Third-place rankings saved & bracket resolved.");
    await loadState();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStep(2);
  }

  async function saveMatchResult(matchId: string) {
    const s = scores[matchId];
    if (!s || s.home === "" || s.away === "") { setSaveError("Enter both scores"); return; }
    setSaving(true); setSaveError("");
    const res = await fetch(`/api/admin/matches/${matchId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeScore: Number(s.home), awayScore: Number(s.away) }),
    });
    setSaving(false);
    if (!res.ok) { setSaveError("Failed to save result"); return; }
    flash("Result saved.");
    await loadState();
  }

  async function advancePhase() {
    await loadState();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  function GroupStep() {
    const groups = tournament?.groups ?? [];
    return (
      <div>
        <h2 className="text-xl font-bold mb-1">Group Stage Standings</h2>
        <p className="text-sm muted mb-6">Drag teams within each group to set the final standings, then click Finalize.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {groups.map((group) => {
            const teamIds = groupStandings[group.id] ?? group.teams.map((t) => t.team.id);
            return (
              <div key={group.id} className="card p-4">
                <div className="font-bold mb-3">Group {group.name}</div>
                <ol className="space-y-1">
                  {teamIds.map((teamId, idx) => {
                    const team = allTeamsById.get(teamId);
                    if (!team) return null;
                    return (
                      <li
                        key={teamId}
                        className="flex items-center gap-2 p-2 rounded cursor-grab active:cursor-grabbing"
                        style={{ background: "var(--card-bg)", border: "1px solid var(--border)" }}
                        draggable
                        onDragStart={() => { dragGroupRef.current = { groupId: group.id, fromIdx: idx }; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragGroupRef.current?.groupId === group.id) {
                            moveGroupTeam(group.id, dragGroupRef.current.fromIdx, idx);
                          }
                          dragGroupRef.current = null;
                        }}
                      >
                        <span className="text-xs muted w-4">{idx + 1}.</span>
                        <span className="text-base">{flagEmoji(team.fifaCode)}</span>
                        <span className="text-sm font-medium flex-1">{team.name}</span>
                        <span className="flex gap-1">
                          <button className="btn-ghost px-1 py-0 text-xs" disabled={idx === 0} onClick={() => moveGroupTeam(group.id, idx, idx - 1)}>↑</button>
                          <button className="btn-ghost px-1 py-0 text-xs" disabled={idx === teamIds.length - 1} onClick={() => moveGroupTeam(group.id, idx, idx + 1)}>↓</button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
        {saveError && <p className="text-sm text-red-500 mb-3">{saveError}</p>}
        {saveSuccess && <p className="text-sm text-green-500 mb-3">{saveSuccess}</p>}
        <button className="btn-primary" disabled={saving} onClick={saveGroupStandings}>
          {saving ? "Saving…" : "Finalize Group Stage & Advance →"}
        </button>
      </div>
    );
  }

  function ThirdPlaceStep() {
    // Build candidates: position-3 team from each group
    const groups = tournament?.groups ?? [];
    const candidates = groups.map((g) => {
      const standing = groupStandings[g.id] ?? g.teams.map((t) => t.team.id);
      return { teamId: standing[2], groupName: g.name };
    }).filter((c) => c.teamId);

    // Compute which slot each ranked team ends up in via the scenario lookup
    const qualifyingGroupLetters = thirdPlaceRanking
      .slice(0, THIRD_PLACE_MATCH_SLOTS.length)
      .map((teamId) => candidates.find((c) => c.teamId === teamId)?.groupName ?? "");
    const scenario = qualifyingGroupLetters.length === THIRD_PLACE_MATCH_SLOTS.length
      ? lookupThirdPlaceScenario(qualifyingGroupLetters)
      : null;

    return (
      <div>
        <h2 className="text-xl font-bold mb-1">Best Third-Place Teams</h2>
        <p className="text-sm muted mb-6">Rank all {candidates.length} third-place teams. The top {THIRD_PLACE_MATCH_SLOTS.length} qualify for the Round of 32.</p>
        <div className="card p-4 max-w-md mb-8">
          <ol className="space-y-1">
            {thirdPlaceRanking.map((teamId, idx) => {
              const team = allTeamsById.get(teamId);
              if (!team) return null;
              const slot = scenario && idx < THIRD_PLACE_MATCH_SLOTS.length
                ? (scenario as Record<string, string>)[THIRD_PLACE_MATCH_SLOTS[idx]] ?? null
                : null;
              return (
                <li
                  key={teamId}
                  className="flex items-center gap-2 p-2 rounded cursor-grab active:cursor-grabbing"
                  style={{ background: "var(--card-bg)", border: "1px solid var(--border)" }}
                  draggable
                  onDragStart={() => { dragThirdRef.current = idx; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragThirdRef.current != null) moveThirdPlace(dragThirdRef.current, idx);
                    dragThirdRef.current = null;
                  }}
                >
                  <span className="text-xs muted w-5">{idx + 1}.</span>
                  <span className="text-base">{flagEmoji(team.fifaCode)}</span>
                  <span className="text-sm font-medium flex-1">{team.name}</span>
                  {idx < THIRD_PLACE_MATCH_SLOTS.length
                    ? <span className="text-xs muted">→ slot {slot ?? "?"}</span>
                    : <span className="text-xs muted line-through">eliminated</span>}
                  <span className="flex gap-1">
                    <button className="btn-ghost px-1 py-0 text-xs" disabled={idx === 0} onClick={() => moveThirdPlace(idx, idx - 1)}>↑</button>
                    <button className="btn-ghost px-1 py-0 text-xs" disabled={idx === thirdPlaceRanking.length - 1} onClick={() => moveThirdPlace(idx, idx + 1)}>↓</button>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        {saveError && <p className="text-sm text-red-500 mb-3">{saveError}</p>}
        {saveSuccess && <p className="text-sm text-green-500 mb-3">{saveSuccess}</p>}
        <button className="btn-primary" disabled={saving} onClick={saveThirdPlace}>
          {saving ? "Saving…" : "Finalize Third-Place Rankings & Advance →"}
        </button>
      </div>
    );
  }

  function KnockoutStep() {
    if (!currentPhase) return null;
    const allDone = currentPhaseMatches.every((m) => m.status === "FINISHED");
    return (
      <div>
        <h2 className="text-xl font-bold mb-1">{currentPhase.name}</h2>
        <p className="text-sm muted mb-6">Enter the final score for each match and save individually. All results trigger bracket resolution and score recalculation.</p>
        <div className="space-y-4 mb-8">
          {currentPhaseMatches.map((match) => {
            const home = match.homeTeam;
            const away = match.awayTeam;
            const s = scores[match.id] ?? { home: "", away: "" };
            const finished = match.status === "FINISHED";
            return (
              <div
                key={match.id}
                className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                style={{ opacity: finished && !saving ? 0.85 : 1 }}
              >
                <div className="flex-1 font-medium text-sm">
                  {home ? <>{flagEmoji(home.fifaCode)} {home.name}</> : <span className="muted">TBD</span>}
                  <span className="mx-2 muted">vs</span>
                  {away ? <>{flagEmoji(away.fifaCode)} {away.name}</> : <span className="muted">TBD</span>}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="field w-16 text-center"
                    min={0}
                    placeholder="0"
                    type="number"
                    value={s.home}
                    onChange={(e) => setScores((prev) => ({ ...prev, [match.id]: { ...s, home: e.target.value } }))}
                  />
                  <span className="muted font-bold">–</span>
                  <input
                    className="field w-16 text-center"
                    min={0}
                    placeholder="0"
                    type="number"
                    value={s.away}
                    onChange={(e) => setScores((prev) => ({ ...prev, [match.id]: { ...s, away: e.target.value } }))}
                  />
                  <button
                    className={finished ? "btn-secondary text-xs" : "btn-primary text-xs"}
                    disabled={saving || !home || !away}
                    onClick={() => saveMatchResult(match.id)}
                  >
                    {finished ? "Update" : "Save"}
                  </button>
                  {finished && <span className="text-xs text-green-500">✓</span>}
                </div>
              </div>
            );
          })}
        </div>
        {saveError && <p className="text-sm text-red-500 mb-3">{saveError}</p>}
        {saveSuccess && <p className="text-sm text-green-500 mb-3">{saveSuccess}</p>}
        {step < totalSteps - 1 && (
          <button
            className="btn-primary"
            disabled={!allDone}
            title={!allDone ? "Record all match results first" : undefined}
            onClick={advancePhase}
          >
            Advance to {knockoutPhases[step - 1]?.name ?? "next round"} →
          </button>
        )}
        {step === totalSteps - 1 && allDone && (
          <p className="text-sm text-green-500 font-semibold mt-4">🏆 Tournament complete! All results recorded.</p>
        )}
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container py-8">
        <p className="muted">Loading tournament state…</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="container py-8">
        <p className="muted">No active tournament found.</p>
        <Link className="btn-secondary mt-4 inline-block" href="/dashboard/admin">← Back to Admin</Link>
      </div>
    );
  }

  const stepLabels = ["Groups", "3rd Place", ...knockoutPhases.map((p) => p.name)];

  return (
    <div className="container py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link className="btn-secondary text-sm" href="/dashboard/admin">← Admin</Link>
        <h1 className="text-2xl font-bold">{tournament.name} — Manage Results</h1>
      </div>

      {/* Step tabs */}
      <div className="flex gap-2 flex-wrap mb-8">
        {stepLabels.map((label, i) => (
          <button
            key={i}
            className={i === step ? "btn-primary text-sm" : "btn-secondary text-sm"}
            onClick={() => setStep(i)}
          >
            {i < step ? "✓ " : ""}{label}
          </button>
        ))}
      </div>

      {step === 0 && GroupStep()}
      {step === 1 && ThirdPlaceStep()}
      {step >= 2 && KnockoutStep()}
    </div>
  );
}
