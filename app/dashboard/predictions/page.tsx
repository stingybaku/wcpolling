"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Team = { id: string; name: string; fifaCode: string };
type TournamentGroup = {
  id: string;
  name: string;
  teams: Array<{ team: Team }>;
};
type TournamentPhase = {
  id: string;
  name: string;
  slug: string;
  isKnockout: boolean;
};
type Match = {
  id: string;
  label?: string | null;
  group?: { id: string; name: string } | null;
  phase: TournamentPhase;
  homeTeam?: Team | null;
  awayTeam?: Team | null;
  homePlaceholder?: string | null;
  awayPlaceholder?: string | null;
};
type TieBreaker = {
  id: string;
  prompt: string;
  type: "NUMBER" | "TEXT";
};
type Tournament = {
  id: string;
  name: string;
  description?: string | null;
  groups: TournamentGroup[];
  phases: TournamentPhase[];
  tieBreakers: TieBreaker[];
};
type Prediction = {
  id: string;
  name: string;
  description?: string | null;
  selected: boolean;
  entries: Array<{
    matchId: string;
    predictedHomeTeamId?: string | null;
    predictedAwayTeamId?: string | null;
    predictedHomeScore?: number | null;
    predictedAwayScore?: number | null;
  }>;
  groupStandings: Array<{ groupId: string; teamId: string; position: number }>;
  tieBreakerAnswers: Array<{ questionId: string; answer: string }>;
  submissions: Array<{
    id: string;
    group: { name: string };
    scores: Array<{ points: number; scoreType: "MATCH" | "GROUP_STANDING" | "KNOCKOUT" | "TIEBREAKER" }>;
  }>;
};

type EntryState = {
  predictedHomeTeamId: string;
  predictedAwayTeamId: string;
  predictedHomeScore: string;
  predictedAwayScore: string;
};

export default function DashboardPredictionsPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [editingPredictionId, setEditingPredictionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [standings, setStandings] = useState<Record<string, string>>({});
  const [tieBreakers, setTieBreakers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const allTeams = useMemo(() => {
    const byId = new Map<string, Team>();
    tournament?.groups.forEach((group) => {
      group.teams.forEach(({ team }) => {
        byId.set(team.id, team);
      });
    });
    return Array.from(byId.values());
  }, [tournament]);

  const groupMatches = useMemo(() => matches.filter((match) => !match.phase.isKnockout), [matches]);
  const knockoutMatches = useMemo(() => matches.filter((match) => match.phase.isKnockout), [matches]);

  function summarizeSubmission(scores: Array<{ points: number; scoreType: "MATCH" | "GROUP_STANDING" | "KNOCKOUT" | "TIEBREAKER" }>) {
    return scores.reduce(
      (accumulator, score) => {
        accumulator.total += score.points;
        accumulator[score.scoreType] += score.points;
        return accumulator;
      },
      {
        total: 0,
        MATCH: 0,
        GROUP_STANDING: 0,
        KNOCKOUT: 0,
        TIEBREAKER: 0,
      }
    );
  }

  async function loadPredictions() {
    const res = await fetch("/api/predictions");
    if (!res.ok) return;
    const data = await res.json();
    setPredictions(data.predictions || []);
  }

  function createInitialEntries(matchList: Match[]) {
    return matchList.reduce<Record<string, EntryState>>((accumulator, match) => {
      accumulator[match.id] = {
        predictedHomeTeamId: match.homeTeam?.id ?? "",
        predictedAwayTeamId: match.awayTeam?.id ?? "",
        predictedHomeScore: "",
        predictedAwayScore: "",
      };
      return accumulator;
    }, {});
  }

  function resetEditorState(matchList: Match[]) {
    setEditingPredictionId(null);
    setName("");
    setDescription("");
    setEntries(createInitialEntries(matchList));
    setStandings({});
    setTieBreakers({});
  }

  useEffect(() => {
    async function loadAll() {
      const tournamentRequest = fetch("/api/tournament")
        .then(async (res) => {
          if (!res.ok) {
            setError("No active tournament is configured yet.");
            return;
          }

          const data = await res.json();
          setTournament(data.tournament);
          setMatches(data.matches || []);
          setEditingPredictionId(null);
          setName("");
          setDescription("");
          setEntries(createInitialEntries(data.matches || []));
          setStandings({});
          setTieBreakers({});
        });

      await Promise.all([loadPredictions(), tournamentRequest]);
    }

    void loadAll();
  }, []);

  function updateEntry(matchId: string, patch: Partial<EntryState>) {
    setEntries((current) => ({
      ...current,
      [matchId]: {
        ...current[matchId],
        ...patch,
      },
    }));
  }

  function updateStanding(groupId: string, position: number, teamId: string) {
    setStandings((current) => ({
      ...current,
      [`${groupId}:${position}`]: teamId,
    }));
  }

  function loadPredictionIntoEditor(prediction: Prediction) {
    setEditingPredictionId(prediction.id);
    setName(prediction.name);
    setDescription(prediction.description ?? "");

    const nextEntries = createInitialEntries(matches);
    prediction.entries.forEach((entry) => {
      nextEntries[entry.matchId] = {
        predictedHomeTeamId: entry.predictedHomeTeamId ?? nextEntries[entry.matchId]?.predictedHomeTeamId ?? "",
        predictedAwayTeamId: entry.predictedAwayTeamId ?? nextEntries[entry.matchId]?.predictedAwayTeamId ?? "",
        predictedHomeScore: entry.predictedHomeScore == null ? "" : String(entry.predictedHomeScore),
        predictedAwayScore: entry.predictedAwayScore == null ? "" : String(entry.predictedAwayScore),
      };
    });
    setEntries(nextEntries);

    setStandings(
      Object.fromEntries(
        prediction.groupStandings.map((standing) => [`${standing.groupId}:${standing.position}`, standing.teamId])
      )
    );
    setTieBreakers(
      Object.fromEntries(
        prediction.tieBreakerAnswers.map((answer) => [answer.questionId, answer.answer])
      )
    );
    setMessage(`Editing "${prediction.name}".`);
    setError("");
  }

  async function savePrediction(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    if (!name.trim()) {
      setError("Prediction name is required.");
      return;
    }

    const standingsError = validateStandings();
    if (standingsError) {
      setError(standingsError);
      return;
    }

    const incompleteGroups = (tournament?.groups ?? []).filter((group) =>
      group.teams.some((_, index) => !standings[`${group.id}:${index + 1}`])
    );
    if (incompleteGroups.length > 0) {
      const names = incompleteGroups.map((g) => g.name).join(", ");
      setError(`Incomplete standings in: ${names}. Fill all positions or leave the entire group blank.`);
      return;
    }

    const payload = {
      name,
      description,
      entries: Object.entries(entries).map(([matchId, entry]) => ({
        matchId,
        predictedHomeTeamId: entry.predictedHomeTeamId || null,
        predictedAwayTeamId: entry.predictedAwayTeamId || null,
        predictedHomeScore: entry.predictedHomeScore === "" ? null : Number(entry.predictedHomeScore),
        predictedAwayScore: entry.predictedAwayScore === "" ? null : Number(entry.predictedAwayScore),
      })),
      groupStandings: Object.entries(standings).map(([key, teamId]) => {
        const [groupId, position] = key.split(":");
        return { groupId, teamId, position: Number(position) };
      }),
      tieBreakerAnswers: Object.entries(tieBreakers).map(([questionId, answer]) => ({ questionId, answer })),
    };

    const res = await fetch(editingPredictionId ? `/api/predictions/${editingPredictionId}` : "/api/predictions", {
      method: editingPredictionId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Failed to save prediction.");
      setSaving(false);
      return;
    }

    setMessage(editingPredictionId ? "Prediction updated." : "Prediction saved.");
    setSaving(false);
    resetEditorState(matches);
    await loadPredictions();
  }

  async function selectPrediction(id: string) {
    const res = await fetch(`/api/predictions/${id}/select`, { method: "POST" });
    if (res.ok) {
      setMessage("Prediction selected.");
      await loadPredictions();
    }
  }

  async function deletePrediction(id: string) {
    const res = await fetch(`/api/predictions/${id}`, { method: "DELETE" });
    if (res.status === 409) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Cannot delete this prediction.");
      setDeletingId(null);
      return;
    }
    if (res.ok || res.status === 204) {
      setMessage("Prediction deleted.");
      setDeletingId(null);
      if (editingPredictionId === id) resetEditorState(matches);
      await loadPredictions();
    }
  }

  function validateStandings(): string | null {
    for (const group of tournament?.groups ?? []) {
      const selectedTeamIds = group.teams.map((_, index) => standings[`${group.id}:${index + 1}`]).filter(Boolean);
      const uniqueIds = new Set(selectedTeamIds);
      if (uniqueIds.size !== selectedTeamIds.length) {
        return `Group ${group.name}: the same team is selected at multiple positions.`;
      }
    }
    return null;
  }

  return (
    <div className="space-y-6">
      <section className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>Predictions</p>
            <h2 className="display-title mt-3 text-5xl leading-none md:text-7xl">{tournament?.name ?? "Tournament"} sheet.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 muted">Fill the active tournament like a prediction sheet: group matches, standings, knockout bracket, and final tie-breakers.</p>
          </div>
          <Link href="/dashboard" className="surface rounded-[1.4rem] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em]">Back</Link>
        </div>
      </section>

      {message ? <div className="rounded-[1.5rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--accent-soft)" }}>{message}</div> : null}
      {error ? <div className="rounded-[1.5rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <form onSubmit={savePrediction} className="space-y-5">
          <div className="surface rounded-[2rem] p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Draft details</p>
            <div className="mt-5 space-y-4">
              <input className="field" placeholder="Prediction name" value={name} onChange={(event) => setName(event.target.value)} />
              <textarea className="field min-h-[7rem]" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
              {editingPredictionId ? (
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em]" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
                    Editing existing draft
                  </div>
                  <button className="rounded-full border px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em]" onClick={() => resetEditorState(matches)} style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }} type="button">
                    Cancel edit
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {tournament?.groups.map((group) => (
            <div key={group.id} className="surface rounded-[2rem] p-6 md:p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Group stage</p>
                  <h3 className="mt-2 text-3xl font-extrabold">{group.name}</h3>
                </div>
                <p className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>{group.teams.length} teams</p>
              </div>

              <div className="mt-5 space-y-4">
                {groupMatches.filter((match) => match.group?.id === group.id).map((match) => (
                  <div key={match.id} className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                    <p className="text-sm font-bold">{match.homeTeam?.name ?? match.homePlaceholder ?? "TBD"} vs {match.awayTeam?.name ?? match.awayPlaceholder ?? "TBD"}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <input className="field" type="number" min="0" value={entries[match.id]?.predictedHomeScore ?? ""} onChange={(event) => updateEntry(match.id, { predictedHomeScore: event.target.value })} placeholder="Home score" />
                      <input className="field" type="number" min="0" value={entries[match.id]?.predictedAwayScore ?? ""} onChange={(event) => updateEntry(match.id, { predictedAwayScore: event.target.value })} placeholder="Away score" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <p className="text-sm font-bold">Predicted standings</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {group.teams.map((_, index) => {
                    const position = index + 1;
                    const key = `${group.id}:${position}`;
                    const takenByOthers = new Set(
                      group.teams
                        .map((__, i) => standings[`${group.id}:${i + 1}`])
                        .filter((teamId, i) => i !== index && teamId)
                    );
                    return (
                      <div key={index} className="rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)" }}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] muted">Position {position}</p>
                        <select className="field" value={standings[key] ?? ""} onChange={(event) => updateStanding(group.id, position, event.target.value)}>
                          <option value="">Select team</option>
                          {group.teams.map(({ team }) => (
                            <option key={team.id} value={team.id} disabled={takenByOthers.has(team.id)}>
                              {team.name}{takenByOthers.has(team.id) ? " (already placed)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          <div className="surface rounded-[2rem] p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Knockout bracket</p>
            <div className="mt-5 space-y-4">
              {tournament?.phases.filter((phase) => phase.isKnockout).map((phase) => (
                <div key={phase.id}>
                  <h3 className="text-2xl font-extrabold">{phase.name}</h3>
                  <div className="mt-3 grid gap-4 xl:grid-cols-2">
                    {knockoutMatches.filter((match) => match.phase.id === phase.id).map((match) => {
                      const homeResolved = !!match.homeTeam;
                      const awayResolved = !!match.awayTeam;
                      const homeName = match.homeTeam?.name ?? match.homePlaceholder ?? "TBD";
                      const awayName = match.awayTeam?.name ?? match.awayPlaceholder ?? "TBD";
                      return (
                        <div key={match.id} className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                          <p className="text-sm font-bold">{match.label || `${homeName} vs ${awayName}`}</p>
                          {(!homeResolved || !awayResolved) && (
                            <p className="mt-1 text-xs muted">Teams not yet decided — predict who you think will advance.</p>
                          )}
                          <div className="mt-4 space-y-3">
                            <select className="field" value={entries[match.id]?.predictedHomeTeamId ?? ""} onChange={(event) => updateEntry(match.id, { predictedHomeTeamId: event.target.value })}>
                              <option value="">{homeResolved ? "Change home team" : `${homeName} — pick a team`}</option>
                              {homeResolved
                                ? <option value={match.homeTeam!.id}>{match.homeTeam!.name}</option>
                                : allTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)
                              }
                            </select>
                            <select className="field" value={entries[match.id]?.predictedAwayTeamId ?? ""} onChange={(event) => updateEntry(match.id, { predictedAwayTeamId: event.target.value })}>
                              <option value="">{awayResolved ? "Change away team" : `${awayName} — pick a team`}</option>
                              {awayResolved
                                ? <option value={match.awayTeam!.id}>{match.awayTeam!.name}</option>
                                : allTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)
                              }
                            </select>
                            <div className="grid grid-cols-2 gap-3">
                              <input className="field" type="number" min="0" value={entries[match.id]?.predictedHomeScore ?? ""} onChange={(event) => updateEntry(match.id, { predictedHomeScore: event.target.value })} placeholder="Home score" />
                              <input className="field" type="number" min="0" value={entries[match.id]?.predictedAwayScore ?? ""} onChange={(event) => updateEntry(match.id, { predictedAwayScore: event.target.value })} placeholder="Away score" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface rounded-[2rem] p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Final tie-breakers</p>
            <div className="mt-5 space-y-4">
              {tournament?.tieBreakers.map((question) => (
                <div key={question.id}>
                  <label className="mb-2 block text-sm font-semibold">{question.prompt}</label>
                  <input
                    className="field"
                    type={question.type === "NUMBER" ? "number" : "text"}
                    value={tieBreakers[question.id] ?? ""}
                    onChange={(event) => setTieBreakers((current) => ({ ...current, [question.id]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="submit" disabled={saving}>
            {saving ? "Saving..." : editingPredictionId ? "Update prediction sheet" : "Save prediction sheet"}
          </button>
        </form>

        <aside className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Your drafts</p>
          <div className="mt-5 space-y-4">
            {predictions.length === 0 ? <p className="muted">No predictions yet.</p> : predictions.map((prediction) => (
              <div key={prediction.id} className="rounded-[1.4rem] border p-4" style={{ borderColor: prediction.selected ? "color-mix(in srgb, var(--accent) 45%, var(--border) 55%)" : "var(--border)", background: prediction.selected ? "var(--accent-soft)" : "var(--bg-strong)" }}>
                <p className="text-lg font-extrabold">{prediction.name}</p>
                <p className="mt-1 text-sm muted">{prediction.description || "No description"}</p>
                <p className="mt-3 text-sm muted">{prediction.entries.length} match picks, {prediction.groupStandings.length} standings slots, {prediction.tieBreakerAnswers.length} tie-breakers</p>
                {prediction.submissions.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {prediction.submissions.map((submission) => {
                      const summary = summarizeSubmission(submission.scores);
                      return (
                        <div key={submission.id} className="rounded-[1rem] border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold">{submission.group.name}</span>
                            <span className="text-sm font-extrabold" style={{ color: "var(--accent-strong)" }}>{summary.total}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <span>Matches: {summary.MATCH}</span>
                            <span>Standings: {summary.GROUP_STANDING}</span>
                            <span>Bracket: {summary.KNOCKOUT}</span>
                            <span>Tie-breakers: {summary.TIEBREAKER}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-xs muted">Not submitted to any group yet.</p>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button className="rounded-full border px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em]" onClick={() => loadPredictionIntoEditor(prediction)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">
                    Edit
                  </button>
                  {!prediction.selected ? (
                    <button className="rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-white" onClick={() => selectPrediction(prediction.id)} style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="button">
                      Select
                    </button>
                  ) : (
                    <p className="self-center text-sm font-bold" style={{ color: "var(--accent-strong)" }}>Currently selected</p>
                  )}
                  {prediction.submissions.length === 0 && (
                    deletingId === prediction.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs muted">Delete?</span>
                        <button className="rounded-full px-3 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-white" onClick={() => deletePrediction(prediction.id)} style={{ background: "var(--danger)" }} type="button">Yes</button>
                        <button className="rounded-full border px-3 py-2 text-xs font-extrabold uppercase tracking-[0.2em]" onClick={() => setDeletingId(null)} style={{ borderColor: "var(--border)", background: "var(--bg)" }} type="button">No</button>
                      </div>
                    ) : (
                      <button className="rounded-full border px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em]" onClick={() => setDeletingId(prediction.id)} style={{ borderColor: "var(--border)", color: "var(--danger)", background: "var(--bg)" }} type="button">
                        Delete
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
