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
  type: "CLASSIC" | "STAGED";
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

export default function TournamentManager({ tournamentId }: { tournamentId: string }) {
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
    const query = tournamentId ? `?tournamentId=${tournamentId}` : "";
    const res = await fetch(`/api/admin/tournament/state${query}`);
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
  }, [tournamentId]);

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
        <h3 className="display text-xl" style={{ margin: "0 0 4px" }}>Group Stage Standings</h3>
        <p className="text-sm muted" style={{ marginBottom: 20 }}>Drag teams within each group to set the final standings, then click Finalize.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ marginBottom: 24 }}>
          {groups.map((group) => {
            const teamIds = groupStandings[group.id] ?? group.teams.map((t) => t.team.id);
            return (
              <div key={group.id} className="surface" style={{ padding: 16 }}>
                <div className="bold" style={{ marginBottom: 10 }}>Group {group.name}</div>
                <ol className="col gap-1">
                  {teamIds.map((teamId, idx) => {
                    const team = allTeamsById.get(teamId);
                    if (!team) return null;
                    return (
                      <li
                        key={teamId}
                        className="row gap-2"
                        style={{
                          alignItems: "center",
                          padding: "7px 8px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          cursor: "grab",
                        }}
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
                        <span className="text-xs mono muted" style={{ width: 16 }}>{idx + 1}.</span>
                        <span>{flagEmoji(team.fifaCode)}</span>
                        <span className="text-sm bold" style={{ flex: 1 }}>{team.name}</span>
                        <span className="row gap-1">
                          <button className="btn btn-ghost btn-sm" disabled={idx === 0} style={{ padding: "2px 6px" }} onClick={() => moveGroupTeam(group.id, idx, idx - 1)}>↑</button>
                          <button className="btn btn-ghost btn-sm" disabled={idx === teamIds.length - 1} style={{ padding: "2px 6px" }} onClick={() => moveGroupTeam(group.id, idx, idx + 1)}>↓</button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
        <button className="btn btn-accent" disabled={saving} onClick={saveGroupStandings}>
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
        <h3 className="display text-xl" style={{ margin: "0 0 4px" }}>Best Third-Place Teams</h3>
        <p className="text-sm muted" style={{ marginBottom: 20 }}>Rank all {candidates.length} third-place teams. The top {THIRD_PLACE_MATCH_SLOTS.length} qualify for the Round of 32.</p>
        <div className="surface" style={{ padding: 16, maxWidth: 480, marginBottom: 24 }}>
          <ol className="col gap-1">
            {thirdPlaceRanking.map((teamId, idx) => {
              const team = allTeamsById.get(teamId);
              if (!team) return null;
              const slot = scenario && idx < THIRD_PLACE_MATCH_SLOTS.length
                ? (scenario as Record<string, string>)[THIRD_PLACE_MATCH_SLOTS[idx]] ?? null
                : null;
              const qualifies = idx < THIRD_PLACE_MATCH_SLOTS.length;
              return (
                <li
                  key={teamId}
                  className="row gap-2"
                  style={{
                    alignItems: "center",
                    padding: "7px 8px",
                    background: qualifies ? "var(--accent-soft)" : "var(--bg)",
                    border: `1px solid ${qualifies ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 6,
                    cursor: "grab",
                  }}
                  draggable
                  onDragStart={() => { dragThirdRef.current = idx; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragThirdRef.current != null) moveThirdPlace(dragThirdRef.current, idx);
                    dragThirdRef.current = null;
                  }}
                >
                  <span className="text-xs mono muted" style={{ width: 20 }}>{idx + 1}.</span>
                  <span>{flagEmoji(team.fifaCode)}</span>
                  <span className="text-sm bold" style={{ flex: 1 }}>{team.name}</span>
                  {qualifies
                    ? <span className="text-xs mono" style={{ color: "var(--accent-strong)" }}>→ slot {slot ?? "?"}</span>
                    : <span className="text-xs muted" style={{ textDecoration: "line-through" }}>eliminated</span>
                  }
                  <span className="row gap-1">
                    <button className="btn btn-ghost btn-sm" disabled={idx === 0} style={{ padding: "2px 6px" }} onClick={() => moveThirdPlace(idx, idx - 1)}>↑</button>
                    <button className="btn btn-ghost btn-sm" disabled={idx === thirdPlaceRanking.length - 1} style={{ padding: "2px 6px" }} onClick={() => moveThirdPlace(idx, idx + 1)}>↓</button>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <button className="btn btn-accent" disabled={saving} onClick={saveThirdPlace}>
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
        <h3 className="display text-xl" style={{ margin: "0 0 4px" }}>{currentPhase.name}</h3>
        <p className="text-sm muted" style={{ marginBottom: 20 }}>Enter the final score for each match and save individually. Results trigger bracket resolution and score recalculation.</p>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", marginBottom: 24 }}
        >
          {currentPhaseMatches.map((match) => {
            const home = match.homeTeam;
            const away = match.awayTeam;
            const s = scores[match.id] ?? { home: "", away: "" };
            const finished = match.status === "FINISHED";
            return (
              <div
                key={match.id}
                className="surface"
                style={{ padding: 16, opacity: finished && !saving ? 0.88 : 1 }}
              >
                {/* Match label */}
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span className="text-xs mono muted" style={{ letterSpacing: "0.14em" }}>
                    {match.group ? `${match.group.name} · ` : ""}{match.label ?? currentPhase.name}
                  </span>
                  {finished && (
                    <span className="chip chip-accent" style={{ fontSize: 9 }}>✓ Scored</span>
                  )}
                </div>

                {/* Teams + score inputs */}
                <div className="row gap-3" style={{ alignItems: "center" }}>
                  <div className="row gap-2" style={{ alignItems: "center", flex: 1 }}>
                    <span>{home ? flagEmoji(home.fifaCode) : "🏳"}</span>
                    <span className="bold text-sm">{home?.name ?? groupLabel(match).split(" vs ")[0]}</span>
                  </div>
                  <div className="row gap-2" style={{ alignItems: "center" }}>
                    <input
                      className="field mono tabnum"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={s.home}
                      style={{ width: 52, fontSize: 22, fontWeight: 800, padding: "6px 8px", textAlign: "center" }}
                      onChange={(e) => setScores((prev) => ({ ...prev, [match.id]: { ...s, home: e.target.value } }))}
                    />
                    <span className="muted-2 text-xl bold">—</span>
                    <input
                      className="field mono tabnum"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={s.away}
                      style={{ width: 52, fontSize: 22, fontWeight: 800, padding: "6px 8px", textAlign: "center" }}
                      onChange={(e) => setScores((prev) => ({ ...prev, [match.id]: { ...s, away: e.target.value } }))}
                    />
                  </div>
                  <div className="row gap-2" style={{ alignItems: "center", flex: 1, justifyContent: "flex-end" }}>
                    <span className="bold text-sm">{away?.name ?? groupLabel(match).split(" vs ")[1]}</span>
                    <span>{away ? flagEmoji(away.fifaCode) : "🏳"}</span>
                  </div>
                </div>

                {/* Save button */}
                <div className="row gap-2" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
                  <button
                    className={finished ? "btn btn-sm" : "btn btn-sm btn-accent"}
                    disabled={saving || (!home && !away)}
                    onClick={() => saveMatchResult(match.id)}
                  >
                    {saving ? "Saving…" : finished ? "Update result" : "Save result"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {step < totalSteps - 1 && (
          <button
            className="btn btn-accent"
            disabled={!allDone}
            title={!allDone ? "Record all match results first" : undefined}
            onClick={advancePhase}
          >
            Advance to {knockoutPhases[step - 1]?.name ?? "next round"} →
          </button>
        )}
        {step === totalSteps - 1 && allDone && (
          <p className="bold" style={{ color: "var(--accent-strong)", marginTop: 16 }}>
            Tournament complete — all results recorded.
          </p>
        )}
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 40 }}>
        <p className="muted">Loading tournament state…</p>
      </div>
    );
  }

  if (tournament?.type === "STAGED") {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ marginBottom: 8 }}><strong>{tournament.name}</strong> is a Staged tournament.</p>
        <p className="muted" style={{ marginBottom: 16 }}>Use the Staged Admin Panel to manage stages, enter results, and score predictions.</p>
        <Link className="btn btn-sm" href={`/dashboard/admin/tournaments/${tournament.id}/staged`} style={{ display: "inline-flex" }}>Manage Stages →</Link>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{ padding: 40 }}>
        <p className="muted">Tournament not found.</p>
        <Link className="btn btn-sm" href="/dashboard/admin" style={{ marginTop: 16, display: "inline-flex" }}>← Back to Admin</Link>
      </div>
    );
  }

  const stepLabels = ["Groups", "3rd Place", ...knockoutPhases.map((p) => p.name)];

  return (
    <div className="-mx-4 -mt-5 md:-mx-6 lg:-mx-8">
      {/* Operator chrome */}
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
          <span className="bold text-md" style={{ color: "#fff" }}>Match Center</span>
          <span className="text-xs mono" style={{ color: "#94a3b8", letterSpacing: "0.16em" }}>· {tournament.name}</span>
        </div>
        <div className="row gap-3" style={{ alignItems: "center" }}>
          <Link
            href="/dashboard/admin"
            className="btn btn-sm"
            style={{ background: "transparent", borderColor: "#334155", color: "#94a3b8" }}
          >
            ← Admin
          </Link>
        </div>
      </div>

      {/* Sub-nav (step tabs) */}
      <div className="row" style={{ borderBottom: "1px solid var(--border)", background: "var(--paper)", overflowX: "auto" }}>
        {stepLabels.map((label, i) => (
          <button
            key={i}
            className="btn btn-ghost"
            style={{
              borderRadius: 0,
              borderBottom: i === step ? "2px solid var(--ink)" : "2px solid transparent",
              padding: "12px 18px",
              fontWeight: i === step ? 800 : 500,
              flexShrink: 0,
            }}
            onClick={() => setStep(i)}
          >
            {i < step ? <span style={{ color: "var(--accent-strong)" }}>✓ </span> : null}
            {label}
          </button>
        ))}
      </div>

      {/* Status messages */}
      {saveError ? (
        <div className="row gap-2 pad-3" style={{ background: "var(--live-soft)", borderBottom: "1px solid var(--live)", color: "var(--live)" }}>
          <span className="text-sm">{saveError}</span>
        </div>
      ) : null}
      {saveSuccess ? (
        <div className="row gap-2 pad-3" style={{ background: "var(--accent-soft)", borderBottom: "1px solid var(--accent)", color: "var(--accent-strong)" }}>
          <span className="text-sm">{saveSuccess}</span>
        </div>
      ) : null}

      {/* Step content */}
      <div style={{ padding: "24px" }}>
        {step === 0 && GroupStep()}
        {step === 1 && ThirdPlaceStep()}
        {step >= 2 && KnockoutStep()}
      </div>
    </div>
  );
}
