"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import {
  lookupThirdPlaceScenario,
  THIRD_PLACE_MATCH_SLOTS,
  ThirdPlaceSlot,
} from "@/lib/third-place-scenarios";
import { flagEmoji } from "@/lib/fifa-flags";

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

type MatchExtended = {
  id: string;
  label?: string | null;
  sortOrder: number;
  group?: { id: string; name: string } | null;
  phase: TournamentPhase;
  homeTeam?: Team | null;
  awayTeam?: Team | null;
  homePlaceholder?: string | null;
  awayPlaceholder?: string | null;
  homeSourceType: string;
  awaySourceType: string;
  homeSourceMatchId?: string | null;
  awaySourceMatchId?: string | null;
  homeSourceGroupId?: string | null;
  awaySourceGroupId?: string | null;
  homeSourcePosition?: number | null;
  awaySourcePosition?: number | null;
  homeSourceGroup?: { name: string } | null;
  awaySourceGroup?: { name: string } | null;
};

type TieBreakerQuestion = {
  id: string;
  prompt: string;
  type: "NUMBER" | "TEXT";
  sortOrder: number;
};

type Tournament = {
  id: string;
  name: string;
  groups: TournamentGroup[];
  phases: TournamentPhase[];
  tieBreakers: TieBreakerQuestion[];
};

type SavedPrediction = {
  id: string;
  name: string;
  description?: string | null;
  selected: boolean;
  entries: {
    matchId: string;
    predictedHomeTeamId?: string | null;
    predictedAwayTeamId?: string | null;
    predictedHomeScore?: number | null;
    predictedAwayScore?: number | null;
    match: { phase: { isKnockout: boolean }; groupId?: string | null };
  }[];
  groupStandings: { groupId: string; teamId: string; position: number }[];
  thirdPlaceRankings: { teamId: string; rank: number }[];
  tieBreakerAnswers: { questionId: string; answer: string }[];
  submissions: { id: string; group: { name: string }; scores: { points: number; scoreType: string }[] }[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeResolvedTeams(
  matches: MatchExtended[],
  groups: TournamentGroup[],
  groupStandings: Record<string, string[]>,
  thirdPlaceRanking: string[],
  knockoutPicks: Record<string, string>
): Record<string, { home: string | null; away: string | null }> {
  const groupByName = new Map(groups.map((g) => [g.name.toUpperCase(), g]));
  const teamToGroupName = new Map<string, string>();
  for (const group of groups) {
    for (const { team } of group.teams) {
      teamToGroupName.set(team.id, group.name.toUpperCase());
    }
  }

  const top8 = thirdPlaceRanking.slice(0, 8);
  const top8Letters = top8
    .map((id) => teamToGroupName.get(id))
    .filter((g): g is string => !!g);
  const scenario =
    top8Letters.length === 8 ? lookupThirdPlaceScenario(top8Letters) : null;

  const result: Record<string, { home: string | null; away: string | null }> = {};

  for (const match of matches) {
    if (!match.phase.isKnockout) continue;

    let home: string | null = null;
    let away: string | null = null;

    if (
      match.homeSourceType === "GROUP_POSITION" &&
      match.homeSourceGroupId &&
      match.homeSourcePosition
    ) {
      home =
        groupStandings[match.homeSourceGroupId]?.[match.homeSourcePosition - 1] ??
        null;
    }
    if (
      match.awaySourceType === "GROUP_POSITION" &&
      match.awaySourceGroupId &&
      match.awaySourcePosition
    ) {
      away =
        groupStandings[match.awaySourceGroupId]?.[match.awaySourcePosition - 1] ??
        null;
    }

    const label = match.label?.trim() ?? "";
    const isThirdSlot = THIRD_PLACE_MATCH_SLOTS.includes(label as ThirdPlaceSlot);
    if (scenario && isThirdSlot) {
      const slot = label as ThirdPlaceSlot;
      const ref = scenario[slot];
      const letter = ref.slice(1).toUpperCase();
      const group = groupByName.get(letter);
      if (group) {
        const teamId = groupStandings[group.id]?.[2] ?? null;
        if (match.homeSourceType === "BEST_THIRD") home = teamId;
        if (match.awaySourceType === "BEST_THIRD") away = teamId;
      }
    }

    if (match.homeSourceType === "MATCH_RESULT" && match.homeSourceMatchId) {
      home = knockoutPicks[match.homeSourceMatchId] ?? null;
    }
    if (match.awaySourceType === "MATCH_RESULT" && match.awaySourceMatchId) {
      away = knockoutPicks[match.awaySourceMatchId] ?? null;
    }

    result[match.id] = { home, away };
  }

  return result;
}

function reorderArray<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PredictionsWizard() {
  const t = useTranslations("predictions");
  const tCommon = useTranslations("common");

  // ── Data ─────────────────────────────────────────────────────────────
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<MatchExtended[]>([]);
  const [predictions, setPredictions] = useState<SavedPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Wizard state ──────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // groupId → [teamId pos1, teamId pos2, teamId pos3, teamId pos4]
  const [groupStandings, setGroupStandings] = useState<Record<string, string[]>>({});
  // ordered list of 12 third-place team IDs (index 0 = best)
  const [thirdPlaceRanking, setThirdPlaceRanking] = useState<string[]>([]);
  // matchId → winnerTeamId
  const [knockoutPicks, setKnockoutPicks] = useState<Record<string, string>>({});
  // questionId → answer string
  const [tieBreakerAnswers, setTieBreakerAnswers] = useState<Record<string, string>>({});

  // ── UI state ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Drag state ────────────────────────────────────────────────────────
  const dragRef = useRef<{ listId: string; fromIndex: number } | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────
  const knockoutPhases = useMemo(
    () =>
      (tournament?.phases ?? [])
        .filter((p) => p.isKnockout)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [tournament]
  );

  const tieBreakers = tournament?.tieBreakers ?? [];
  const hasTieBreakers = tieBreakers.length > 0;
  // steps: 0=name, 1=groups, 2=third-place, 3..N=knockout phases, N+1=tie-breakers (if any)
  const totalSteps = 3 + knockoutPhases.length + (hasTieBreakers ? 1 : 0);
  const tieBreakerStep = hasTieBreakers ? totalSteps - 1 : -1;

  const teamById = useMemo(() => {
    const map = new Map<string, Team>();
    tournament?.groups.forEach((g) =>
      g.teams.forEach(({ team }) => map.set(team.id, team))
    );
    return map;
  }, [tournament]);

  const resolvedTeams = useMemo(
    () =>
      computeResolvedTeams(
        matches,
        tournament?.groups ?? [],
        groupStandings,
        thirdPlaceRanking,
        knockoutPicks
      ),
    [matches, tournament, groupStandings, thirdPlaceRanking, knockoutPicks]
  );

  // ── Load data ─────────────────────────────────────────────────────────
  const loadPredictions = useCallback(async () => {
    const res = await fetch("/api/predictions");
    if (res.ok) {
      const data = await res.json();
      setPredictions(data.predictions ?? []);
    }
  }, []);

  useEffect(() => {
    async function loadAll() {
      const [tournamentRes] = await Promise.all([
        fetch("/api/tournament"),
        loadPredictions(),
      ]);
      if (tournamentRes.ok) {
        const data = await tournamentRes.json();
        setTournament(data.tournament);
        setMatches(data.matches ?? []);
      }
      setLoading(false);
    }
    void loadAll();
  }, [loadPredictions]);

  // Initialize group standings with seed order when tournament loads
  useEffect(() => {
    if (!tournament) return;
    setGroupStandings((prev) => {
      const next = { ...prev };
      for (const group of tournament.groups) {
        if (!next[group.id]) {
          next[group.id] = group.teams.map(({ team }) => team.id);
        }
      }
      return next;
    });
  }, [tournament]);

  // Sync third-place ranking when entering step 2
  useEffect(() => {
    if (step !== 2 || !tournament) return;
    const currentThird = tournament.groups
      .map((g) => groupStandings[g.id]?.[2])
      .filter(Boolean) as string[];
    setThirdPlaceRanking((prev) => {
      const kept = prev.filter((id) => currentThird.includes(id));
      const added = currentThird.filter((id) => !prev.includes(id));
      return [...kept, ...added];
    });
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag handlers ─────────────────────────────────────────────────────
  // Visual feedback via direct DOM mutation — avoids React re-renders during drag
  // (re-renders mid-drag unmount components and cancel the browser drag operation)

  function handleDragStart(listId: string, fromIndex: number, e: React.DragEvent) {
    dragRef.current = { listId, fromIndex };
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.currentTarget.setAttribute("data-drag-over", "true");
  }

  function handleDragLeave(e: React.DragEvent) {
    e.currentTarget.removeAttribute("data-drag-over");
  }

  function handleDrop(e: React.DragEvent, listId: string, toIndex: number) {
    e.preventDefault();
    e.currentTarget.removeAttribute("data-drag-over");
    if (!dragRef.current || dragRef.current.listId !== listId) return;
    const { fromIndex } = dragRef.current;
    dragRef.current = null;
    if (fromIndex === toIndex) return;
    if (listId === "thirdplace") {
      setThirdPlaceRanking((prev) => reorderArray(prev, fromIndex, toIndex));
    } else {
      setGroupStandings((prev) => ({
        ...prev,
        [listId]: reorderArray(prev[listId] ?? [], fromIndex, toIndex),
      }));
    }
  }

  function handleDragEnd() {
    dragRef.current = null;
  }

  function moveItem(listId: string, fromIndex: number, direction: -1 | 1) {
    const toIndex = fromIndex + direction;
    if (listId === "thirdplace") {
      setThirdPlaceRanking((prev) => {
        if (toIndex < 0 || toIndex >= prev.length) return prev;
        return reorderArray(prev, fromIndex, toIndex);
      });
    } else {
      setGroupStandings((prev) => {
        const arr = prev[listId] ?? [];
        if (toIndex < 0 || toIndex >= arr.length) return prev;
        return { ...prev, [listId]: reorderArray(arr, fromIndex, toIndex) };
      });
    }
  }

  // ── Validation ────────────────────────────────────────────────────────
  function validateCurrentStep(): string | null {
    if (step === 0) {
      if (!name.trim()) return t("wizard.nameRequired");
    } else if (step === 1) {
      const groups = tournament?.groups ?? [];
      const incomplete = groups.filter(
        (g) => (groupStandings[g.id] ?? []).some((id) => !id) || (groupStandings[g.id] ?? []).length < 4
      );
      if (incomplete.length > 0) return t("wizard.completeGroups");
    } else if (step === 2) {
      if (thirdPlaceRanking.length !== (tournament?.groups.length ?? 12)) {
        return t("wizard.completeThirdPlace");
      }
    } else if (step === tieBreakerStep) {
      const unanswered = tieBreakers.filter((q) => !tieBreakerAnswers[q.id]?.trim());
      if (unanswered.length > 0) return t("wizard.completeTieBreakers");
    } else {
      const phaseIndex = step - 3;
      const phase = knockoutPhases[phaseIndex];
      if (phase) {
        const phaseMatches = matches.filter((m) => m.phase.id === phase.id);
        const unpicked = phaseMatches.filter((m) => !knockoutPicks[m.id]);
        if (unpicked.length > 0) return t("wizard.completeKnockout");
      }
    }
    return null;
  }

  // ── Build save payload ────────────────────────────────────────────────
  function buildPayload(opts?: { skipBracket?: boolean }) {
    const groups = tournament?.groups ?? [];
    const standingsPayload = groups.flatMap((group) =>
      (groupStandings[group.id] ?? [])
        .map((teamId, i) => ({ groupId: group.id, teamId, position: i + 1 }))
        .filter((s) => s.teamId)
    );

    const entriesPayload: {
      matchId: string;
      predictedHomeTeamId: string | null;
      predictedAwayTeamId: string | null;
      predictedHomeScore: number | null;
      predictedAwayScore: number | null;
    }[] = [];

    for (const match of matches) {
      if (!match.phase.isKnockout) continue;
      const resolved = resolvedTeams[match.id];
      if (!resolved) continue;
      const { home, away } = resolved;
      if (!home && !away) continue;

      const winner = knockoutPicks[match.id];
      const homeScore =
        winner && home && away ? (winner === home ? 1 : 0) : null;
      const awayScore =
        winner && home && away ? (winner === away ? 1 : 0) : null;

      entriesPayload.push({
        matchId: match.id,
        predictedHomeTeamId: home,
        predictedAwayTeamId: away,
        predictedHomeScore: homeScore,
        predictedAwayScore: awayScore,
      });
    }

    return {
      name: name.trim(),
      description: description.trim(),
      groupStandings: standingsPayload,
      thirdPlaceRanking: thirdPlaceRanking,
      entries: entriesPayload,
      tieBreakerAnswers: Object.entries(tieBreakerAnswers)
        .filter(([, answer]) => answer.trim() !== "")
        .map(([questionId, answer]) => ({ questionId, answer: answer.trim() })),
      skipBracketPopulation: opts?.skipBracket ?? false,
    };
  }

  // ── Save & advance ────────────────────────────────────────────────────
  async function advanceStep() {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");

    const isLastKnockoutStep = step === totalSteps - 1;
    const nextStep = step + 1;
    const shouldSave = true; // save on every Next click
    const skipBracket = step >= 2; // from step 2 onwards, we manage bracket ourselves

    if (shouldSave) {
      setSaving(true);
      const payload = buildPayload({ skipBracket });
      const url = predictionId
        ? `/api/predictions/${predictionId}`
        : "/api/predictions";
      const method = predictionId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setSaving(false);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("saveFailed"));
        return;
      }

      const data = await res.json();
      if (!predictionId && data.prediction?.id) {
        setPredictionId(data.prediction.id);
      }
    }

    if (isLastKnockoutStep) {
      setDone(true);
      await loadPredictions();
    } else {
      setStep(nextStep);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Load existing draft ───────────────────────────────────────────────
  function loadDraft(pred: SavedPrediction) {
    setPredictionId(pred.id);
    setName(pred.name);
    setDescription(pred.description ?? "");

    // ── Group standings ─────────────────────────────────────────────
    const newStandings: Record<string, string[]> = {};
    const groups = tournament?.groups ?? [];
    for (const group of groups) {
      newStandings[group.id] = new Array(group.teams.length).fill("");
    }
    for (const s of pred.groupStandings) {
      if (!newStandings[s.groupId]) newStandings[s.groupId] = [];
      newStandings[s.groupId][s.position - 1] = s.teamId;
    }
    setGroupStandings(newStandings);

    // ── Third-place ranking — use saved order, fallback to group order ──
    const newThirdPlaceRanking =
      pred.thirdPlaceRankings.length > 0
        ? pred.thirdPlaceRankings.map((r) => r.teamId)
        : (groups.map((g) => newStandings[g.id]?.[2]).filter(Boolean) as string[]);
    setThirdPlaceRanking(newThirdPlaceRanking);

    // ── Knockout picks ──────────────────────────────────────────────
    const newPicks: Record<string, string> = {};
    for (const entry of pred.entries) {
      if (!entry.match.phase.isKnockout) continue;
      const hs = entry.predictedHomeScore;
      const as_ = entry.predictedAwayScore;
      if (hs != null && as_ != null && hs !== as_) {
        const winner = hs > as_ ? entry.predictedHomeTeamId : entry.predictedAwayTeamId;
        if (winner) newPicks[entry.matchId] = winner;
      }
    }
    setKnockoutPicks(newPicks);

    // ── Tie-breaker answers ─────────────────────────────────────────
    const newTieBreakerAnswers: Record<string, string> = {};
    for (const ans of pred.tieBreakerAnswers) {
      newTieBreakerAnswers[ans.questionId] = ans.answer;
    }
    setTieBreakerAnswers(newTieBreakerAnswers);

    // ── Determine resume step ───────────────────────────────────────
    // Walk forward through steps to find the first one that needs work.
    let resumeStep = 1;

    const groupsComplete = groups.length > 0 && groups.every(
      (g) => (newStandings[g.id] ?? []).filter(Boolean).length >= g.teams.length
    );

    if (groupsComplete) {
      const thirdComplete = newThirdPlaceRanking.length >= groups.length;
      if (thirdComplete) {
        // Find first knockout phase with any missing pick
        let firstIncomplete = -1;
        for (let i = 0; i < knockoutPhases.length; i++) {
          const phaseMatches = matches.filter((m) => m.phase.id === knockoutPhases[i].id);
          if (phaseMatches.some((m) => !newPicks[m.id])) {
            firstIncomplete = i;
            break;
          }
        }

        if (firstIncomplete >= 0) {
          resumeStep = 3 + firstIncomplete;
        } else {
          // All knockout phases done — land on tie-breaker step if present, else last knockout step
          resumeStep = hasTieBreakers ? tieBreakerStep : 3 + knockoutPhases.length - 1;
        }
      } else {
        resumeStep = 2;
      }
    }

    setStep(resumeStep);
    setDone(false);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startNew() {
    setPredictionId(null);
    setName("");
    setDescription("");
    setGroupStandings({});
    setThirdPlaceRanking([]);
    setKnockoutPicks({});
    setTieBreakerAnswers({});
    setStep(0);
    setDone(false);
    setError("");
    if (tournament) {
      const initial: Record<string, string[]> = {};
      for (const g of tournament.groups) {
        initial[g.id] = g.teams.map(({ team }) => team.id);
      }
      setGroupStandings(initial);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deletePrediction(id: string) {
    const res = await fetch(`/api/predictions/${id}`, { method: "DELETE" });
    if (res.status === 409) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? t("saveFailed"));
    } else if (res.ok || res.status === 204) {
      if (predictionId === id) startNew();
      setDeletingId(null);
      await loadPredictions();
    }
  }

  async function selectPrediction(id: string) {
    await fetch(`/api/predictions/${id}/select`, { method: "POST" });
    await loadPredictions();
  }

  // ── Render helpers ────────────────────────────────────────────────────

  function DraggableItem({
    listId,
    index,
    total,
    children,
  }: {
    listId: string;
    index: number;
    total: number;
    children: React.ReactNode;
  }) {
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(listId, index, e)}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, listId, index)}
        onDragEnd={handleDragEnd}
        className="drag-item flex items-center gap-2 rounded-[1rem] border px-3 py-2.5 transition-colors"
        style={{ borderColor: "var(--border)", background: "var(--bg-strong)", cursor: "grab" }}
      >
        <span className="shrink-0 text-xs muted select-none" aria-hidden>⠿⠿</span>
        <div className="min-w-0 flex-1">{children}</div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => moveItem(listId, index, -1)}
            disabled={index === 0}
            className="h-6 w-6 rounded text-xs font-bold disabled:opacity-30"
            style={{ background: "var(--bg)" }}
            aria-label="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => moveItem(listId, index, 1)}
            disabled={index === total - 1}
            className="h-6 w-6 rounded text-xs font-bold disabled:opacity-30"
            style={{ background: "var(--bg)" }}
            aria-label="Move down"
          >
            ▼
          </button>
        </div>
      </div>
    );
  }

  // ── Step renders ──────────────────────────────────────────────────────

  function StepName() {
    return (
      <div className="surface rounded-[2rem] p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("wizard.nameDraft")}</p>
        <div className="mt-5 space-y-4">
          <input
            className="field"
            placeholder={t("wizard.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <textarea
            className="field min-h-[5rem]"
            placeholder={t("wizard.descPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
    );
  }

  function StepGroups() {
    const groups = tournament?.groups ?? [];
    return (
      <div className="space-y-5">
        <div className="surface rounded-[2rem] p-5 md:p-6">
          <p className="text-sm muted">{t("wizard.groupStandingsHint")}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--accent-strong)" }}>{t("wizard.dragHint")}</p>
        </div>
        {groups.map((group) => {
          const teamIds = groupStandings[group.id] ?? group.teams.map(({ team }) => team.id);
          return (
            <div key={group.id} className="surface rounded-[2rem] p-5 md:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                >
                  {group.name}
                </div>
                <p className="text-sm font-bold uppercase tracking-[0.18em]">{t("groupStage")}</p>
              </div>
              <div className="space-y-2">
                {teamIds.map((teamId, index) => {
                  const team = teamById.get(teamId);
                  return (
                    <DraggableItem key={teamId} listId={group.id} index={index} total={teamIds.length}>
                      <div className="flex items-center gap-2">
                        <span
                          className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-xs font-extrabold text-white"
                          style={{ background: index < 2 ? "var(--accent)" : index === 2 ? "color-mix(in srgb, var(--accent) 60%, transparent)" : "var(--border)" }}
                        >
                          {index + 1}
                        </span>
                        {team && <span className="text-base leading-none" aria-hidden>{flagEmoji(team.fifaCode)}</span>}
                        <span className="text-sm font-semibold">{team?.name ?? teamId}</span>
                      </div>
                    </DraggableItem>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function StepThirdPlace() {
    const groups = tournament?.groups ?? [];
    const teamToGroupName = new Map<string, string>();
    for (const g of groups) {
      for (const { team } of g.teams) {
        teamToGroupName.set(team.id, g.name);
      }
    }

    return (
      <div className="space-y-5">
        <div className="surface rounded-[2rem] p-5 md:p-6">
          <p className="text-sm muted">{t("wizard.thirdPlaceHint")}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--accent-strong)" }}>{t("wizard.dragHint")}</p>
        </div>
        <div className="surface rounded-[2rem] p-5 md:p-6">
          <div className="space-y-2">
            {thirdPlaceRanking.map((teamId, index) => {
              const team = teamById.get(teamId);
              const groupName = teamToGroupName.get(teamId);
              const isAdvancing = index < 8;
              const showDivider = index === 8;

              return (
                <div key={teamId}>
                  {showDivider && (
                    <div className="my-3 flex items-center gap-3">
                      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("wizard.eliminated")}</span>
                      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                    </div>
                  )}
                  <DraggableItem listId="thirdplace" index={index} total={thirdPlaceRanking.length}>
                    <div className="flex items-center gap-2">
                      <span
                        className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-xs font-extrabold"
                        style={{
                          background: isAdvancing ? "linear-gradient(135deg, var(--accent), var(--accent-strong))" : "var(--border)",
                          color: isAdvancing ? "white" : "var(--fg-muted)",
                        }}
                      >
                        {index + 1}
                      </span>
                      {team && <span className="text-base leading-none" aria-hidden>{flagEmoji(team.fifaCode)}</span>}
                      <span className="text-sm font-semibold">{team?.name ?? teamId}</span>
                      <span className="text-xs muted ml-1">({t("groupStage")} {groupName})</span>
                    </div>
                  </DraggableItem>
                </div>
              );
            })}
          </div>
          {thirdPlaceRanking.length < 8 && (
            <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
              {t("wizard.completeThirdPlace")}
            </p>
          )}
          {thirdPlaceRanking.length === (tournament?.groups.length ?? 12) && (
            <div
              className="mt-4 rounded-[1.2rem] p-3 text-sm"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              {t("wizard.advancingTop8")}: {thirdPlaceRanking.slice(0, 8).map((id) => teamById.get(id)?.fifaCode ?? "?").join(", ")}
            </div>
          )}
        </div>
      </div>
    );
  }

  function StepKnockout({ phaseIndex }: { phaseIndex: number }) {
    const phase = knockoutPhases[phaseIndex];
    if (!phase) return null;
    const phaseMatches = matches
      .filter((m) => m.phase.id === phase.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return (
      <div className="space-y-5">
        <div className="surface rounded-[2rem] p-5 md:p-6">
          <p className="text-sm muted">{t("wizard.pickWinner")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {phaseMatches.map((match) => {
            const resolved = resolvedTeams[match.id];
            const homeId = resolved?.home ?? null;
            const awayId = resolved?.away ?? null;
            const homeTeam = homeId ? teamById.get(homeId) : null;
            const awayTeam = awayId ? teamById.get(awayId) : null;
            const winner = knockoutPicks[match.id];
            const bothKnown = !!homeId && !!awayId;

            return (
              <div
                key={match.id}
                className="surface rounded-[1.8rem] p-4"
                style={{ border: winner ? "1px solid color-mix(in srgb, var(--accent) 40%, var(--border) 60%)" : "1px solid var(--border)" }}
              >
                {match.label && (
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] muted">{match.label}</p>
                )}
                <div className="space-y-2">
                  {[
                    { teamId: homeId, team: homeTeam },
                    { teamId: awayId, team: awayTeam },
                  ].map(({ teamId, team }) => {
                    const isSelected = winner === teamId;
                    const isOtherSelected = winner && winner !== teamId;
                    return (
                      <button
                        key={teamId ?? "tbd"}
                        type="button"
                        disabled={!bothKnown || !teamId}
                        onClick={() => {
                          if (teamId) {
                            setKnockoutPicks((prev) => ({ ...prev, [match.id]: teamId }));
                          }
                        }}
                        className="w-full rounded-[1.2rem] px-4 py-3 text-left text-sm font-semibold transition-all"
                        style={{
                          background: isSelected
                            ? "linear-gradient(135deg, var(--accent), var(--accent-strong))"
                            : isOtherSelected
                            ? "var(--bg)"
                            : "var(--bg-strong)",
                          color: isSelected ? "white" : isOtherSelected ? "var(--fg-muted)" : undefined,
                          border: `1px solid ${isSelected ? "transparent" : "var(--border)"}`,
                          opacity: isOtherSelected ? 0.5 : 1,
                        }}
                      >
                        {team ? (
                          <span className="flex items-center gap-2">
                            <span className="text-lg leading-none" aria-hidden>{flagEmoji(team.fifaCode)}</span>
                            <span>{team.name}</span>
                          </span>
                        ) : (
                          <span className="muted">{t("wizard.tbd")}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function StepTieBreakers() {
    return (
      <div className="space-y-5">
        <div className="surface rounded-[2rem] p-5 md:p-6">
          <p className="text-sm muted">{t("wizard.tieBreakersHint")}</p>
        </div>
        <div className="surface rounded-[2rem] p-5 md:p-6 space-y-5">
          {tieBreakers.map((q, i) => (
            <div key={q.id}>
              {i > 0 && <div className="h-px mb-5" style={{ background: "var(--border)" }} />}
              <label className="block">
                <span className="text-sm font-semibold">{q.prompt}</span>
                <input
                  type={q.type === "NUMBER" ? "number" : "text"}
                  min={q.type === "NUMBER" ? 0 : undefined}
                  className="field mt-2"
                  placeholder={q.type === "NUMBER" ? "0" : t("wizard.tieBreakersTextPlaceholder")}
                  value={tieBreakerAnswers[q.id] ?? ""}
                  onChange={(e) =>
                    setTieBreakerAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function StepDone() {
    return (
      <div className="surface rounded-[2rem] p-8 text-center">
        <p
          className="text-5xl font-extrabold"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          ✓
        </p>
        <p className="mt-4 text-2xl font-extrabold">{t("wizard.done")}</p>
        <p className="mt-2 text-sm muted">{t("wizard.doneDesc")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={startNew}
            className="rounded-[1.2rem] border px-5 py-3 text-sm font-bold"
            style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
          >
            {t("wizard.newDraft")}
          </button>
          {predictionId && (
            <Link
              href={`/dashboard/predictions/${predictionId}`}
              className="rounded-[1.2rem] border px-5 py-3 text-sm font-bold"
              style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--bg-strong)" }}
            >
              {t("wizard.viewPrediction")}
            </Link>
          )}
          <Link
            href="/dashboard/groups"
            className="rounded-[1.2rem] px-5 py-3 text-sm font-extrabold text-white"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
          >
            {t("wizard.goToGroups")}
          </Link>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm muted">{tCommon("loading")}</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="surface rounded-[2rem] p-8 text-center">
        <p className="text-sm muted">{t("noTournament")}</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-[1.2rem] border px-5 py-3 text-sm font-bold" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>{t("back")}</Link>
      </div>
    );
  }

  const stepLabel =
    step === 0
      ? t("wizard.nameDraft")
      : step === 1
      ? t("wizard.groupStandings")
      : step === 2
      ? t("wizard.thirdPlace")
      : step === tieBreakerStep
      ? t("wizard.tieBreakers")
      : knockoutPhases[step - 3]?.name ?? "";

  const progressSteps = [
    t("wizard.nameDraft"),
    t("wizard.groupStandings"),
    t("wizard.thirdPlace"),
    ...knockoutPhases.map((p) => p.name),
    ...(hasTieBreakers ? [t("wizard.tieBreakers")] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <section
        className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p
              className="text-xs font-semibold uppercase tracking-[0.34em]"
              style={{ color: "var(--accent-strong)" }}
            >
              {t("tagline")}
            </p>
            <h2 className="display-title mt-3 text-5xl leading-none md:text-7xl">
              {tournament.name}
            </h2>
            {name && (
              <p className="mt-2 text-base font-bold muted">
                {predictionId ? `${t("editingExisting")}: ` : ""}{name}
              </p>
            )}
          </div>
          <Link
            href="/dashboard"
            className="surface rounded-[1.4rem] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em]"
          >
            {t("back")}
          </Link>
        </div>
      </section>

      {/* Progress bar */}
      {!done && (
        <div className="surface rounded-[1.8rem] p-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {progressSteps.map((label, i) => (
              <div key={i} className="flex items-center gap-1 shrink-0">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold shrink-0"
                  style={{
                    background:
                      i < step
                        ? "var(--accent)"
                        : i === step
                        ? "linear-gradient(135deg, var(--accent), var(--accent-strong))"
                        : "var(--border)",
                    color: i <= step ? "white" : "var(--fg-muted)",
                  }}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span
                  className="hidden text-xs font-semibold sm:block"
                  style={{ color: i === step ? "var(--accent-strong)" : "var(--fg-muted)" }}
                >
                  {label}
                </span>
                {i < progressSteps.length - 1 && (
                  <div
                    className="h-px w-4 shrink-0"
                    style={{ background: i < step ? "var(--accent)" : "var(--border)" }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="rounded-[1.5rem] border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {/* Step content */}
      <div>
        {done ? (
          StepDone()
        ) : step === 0 ? (
          StepName()
        ) : step === 1 ? (
          StepGroups()
        ) : step === 2 ? (
          StepThirdPlace()
        ) : step === tieBreakerStep ? (
          StepTieBreakers()
        ) : (
          StepKnockout({ phaseIndex: step - 3 })
        )}
      </div>

      {/* Navigation */}
      {!done && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => { setError(""); setStep((s) => Math.max(0, s - 1)); }}
            disabled={step === 0}
            className="rounded-[1.2rem] border px-5 py-4 text-sm font-bold disabled:opacity-30"
            style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
          >
            {t("wizard.back")}
          </button>
          <button
            type="button"
            onClick={advanceStep}
            disabled={saving}
            className="rounded-[1.2rem] px-6 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
          >
            {saving
              ? t("wizard.autoSaving")
              : step === totalSteps - 1
              ? t("wizard.finish")
              : t("wizard.saveAndContinue")}
          </button>
        </div>
      )}

      {/* Saved drafts */}
      <section className="surface rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("wizard.yourDrafts")}</p>
          {(done || predictionId) && (
            <button
              type="button"
              onClick={startNew}
              className="rounded-full border px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em]"
              style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
            >
              {t("wizard.newDraft")}
            </button>
          )}
        </div>
        <div className="mt-5 space-y-4">
          {predictions.length === 0 ? (
            <p className="text-sm muted">{t("noPredictions")}</p>
          ) : (
            predictions.map((pred) => {
              const totalPoints = pred.submissions
                .flatMap((s) => s.scores)
                .reduce((sum, sc) => sum + sc.points, 0);
              const isActive = pred.id === predictionId && !done;
              return (
                <div
                  key={pred.id}
                  className="rounded-[1.4rem] border p-4"
                  style={{
                    borderColor: pred.selected
                      ? "color-mix(in srgb, var(--accent) 45%, var(--border) 55%)"
                      : isActive
                      ? "color-mix(in srgb, var(--accent) 30%, var(--border) 70%)"
                      : "var(--border)",
                    background: pred.selected
                      ? "var(--accent-soft)"
                      : "var(--bg-strong)",
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-extrabold">{pred.name}</p>
                      {pred.description && (
                        <p className="mt-0.5 text-sm muted">{pred.description}</p>
                      )}
                    </div>
                    {pred.submissions.length > 0 && (
                      <p className="text-sm font-extrabold" style={{ color: "var(--accent-strong)" }}>
                        {totalPoints} pts
                      </p>
                    )}
                  </div>
                  <p className="mt-2 text-xs muted">
                    {t("draftSummary", {
                      matches: pred.entries.length,
                      standings: pred.groupStandings.length,
                      tieBreakers: pred.tieBreakerAnswers.length,
                    })}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => loadDraft(pred)}
                      className="rounded-full border px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.18em]"
                      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                    >
                      {t("wizard.editDraft")}
                    </button>
                    <Link
                      href={`/dashboard/predictions/${pred.id}`}
                      className="rounded-full border px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.18em]"
                      style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--bg)" }}
                    >
                      {t("wizard.viewPrediction")}
                    </Link>
                    {!pred.selected ? (
                      <button
                        type="button"
                        onClick={() => selectPrediction(pred.id)}
                        className="rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-white"
                        style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                      >
                        {tCommon("select")}
                      </button>
                    ) : (
                      <span
                        className="self-center text-xs font-bold uppercase tracking-[0.18em]"
                        style={{ color: "var(--accent-strong)" }}
                      >
                        {t("currentlySelected")}
                      </span>
                    )}
                    {pred.submissions.length === 0 &&
                      (deletingId === pred.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs muted">{t("confirmDelete")}</span>
                          <button
                            type="button"
                            onClick={() => deletePrediction(pred.id)}
                            className="rounded-full px-3 py-1.5 text-xs font-extrabold text-white"
                            style={{ background: "var(--danger)" }}
                          >
                            {tCommon("yes")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="rounded-full border px-3 py-1.5 text-xs font-extrabold"
                            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                          >
                            {tCommon("no")}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingId(pred.id)}
                          className="rounded-full border px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.18em]"
                          style={{ borderColor: "var(--border)", color: "var(--danger)", background: "var(--bg)" }}
                        >
                          {tCommon("delete")}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
