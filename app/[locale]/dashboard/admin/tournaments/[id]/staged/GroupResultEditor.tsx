"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TeamFlag } from "@/components/team-flag";

type TeamGroup = { id: string; name: string; sortOrder: number };
type Team = { id: string; name: string; fifaCode: string; groupMemberships: Array<{ groupId: string; seed?: number | null; group: TeamGroup }> };
type GroupInfo = { id: string; name: string; sortOrder: number; teams: Team[] };

const POSITION_LABELS = ["W", "RU", "3rd", "4th"];
const POSITION_COLORS = [
  "bg-yellow-500 text-black",
  "bg-gray-400 text-black",
  "bg-amber-700 text-white",
  "bg-gray-700 text-gray-300",
];

export default function GroupResultEditor({
  stageId,
  isClosedStage,
  onLocked,
}: {
  stageId: string;
  isClosedStage: boolean;
  onLocked: () => void;
}) {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [standings, setStandings] = useState<Record<string, string[]>>({}); // groupId -> [teamId, ...]
  const [teamMap, setTeamMap] = useState<Record<string, Team>>({});
  const [thirdRanking, setThirdRanking] = useState<string[]>([]); // all 12 thirds, ranked (top 8 advance)
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const dragGroupRef = useRef<{ groupId: string; fromIdx: number } | null>(null);
  const dragThirdRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load teams + saved draft
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Fetch teams — required; bail out on failure
        const teamsRes = await fetch("/api/admin/teams");
        if (!teamsRes.ok) {
          setError(`Failed to load teams (${teamsRes.status})`);
          return;
        }
        const teamsData = await teamsRes.json();
        const allTeams: Team[] = teamsData.teams ?? [];

        const tMap: Record<string, Team> = {};
        for (const t of allTeams) tMap[t.id] = t;
        setTeamMap(tMap);

        // Build groups from team memberships
        const groupMap: Record<string, GroupInfo> = {};
        for (const team of allTeams) {
          for (const gm of team.groupMemberships ?? []) {
            if (!groupMap[gm.groupId]) {
              groupMap[gm.groupId] = { id: gm.groupId, name: gm.group.name, sortOrder: gm.group.sortOrder, teams: [] };
            }
            if (!groupMap[gm.groupId].teams.find(t => t.id === team.id)) {
              groupMap[gm.groupId].teams.push(team);
            }
          }
        }
        const sortedGroups = Object.values(groupMap).sort((a, b) => a.sortOrder - b.sortOrder);
        setGroups(sortedGroups);

        if (sortedGroups.length === 0) {
          setError("No groups found. Make sure the classic tournament has been seeded with groups and teams.");
          return;
        }

        // Fetch saved draft — optional; ignore failure
        let savedResult: { standings?: Record<string, string[]>; thirdPlace?: string[] } | null = null;
        try {
          const draftRes = await fetch(`/api/admin/staged/stages/${stageId}/group-result`);
          if (draftRes.ok) {
            const draftData = await draftRes.json();
            savedResult = draftData.result ?? null;
          }
        } catch { /* draft unavailable — proceed with defaults */ }

        // Initialize standings
        if (savedResult?.standings && Object.keys(savedResult.standings).length > 0) {
          setStandings(savedResult.standings);
          setThirdRanking(savedResult.thirdPlace ?? []);
        } else {
          const initStandings: Record<string, string[]> = {};
          for (const g of sortedGroups) {
            // Sort teams within the group by their seed
            const sorted = [...g.teams].sort((a, b) => {
              const gmA = a.groupMemberships.find(m => m.groupId === g.id);
              const gmB = b.groupMemberships.find(m => m.groupId === g.id);
              return (gmA?.seed ?? 999) - (gmB?.seed ?? 999);
            });
            initStandings[g.id] = sorted.map(t => t.id);
          }
          setStandings(initStandings);
          const initThirds = sortedGroups.map(g => initStandings[g.id]?.[2]).filter(Boolean) as string[];
          setThirdRanking(initThirds);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load group data");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [stageId]);

  // When standings change, refresh third ranking to reflect new thirds
  // Keep ranking order but replace any changed thirds
  const syncThirds = useCallback((newStandings: Record<string, string[]>, currentRanking: string[], currentGroups: GroupInfo[]) => {
    const newThirds = currentGroups.map(g => newStandings[g.id]?.[2]).filter(Boolean) as string[];
    // Preserve ranking order: keep thirds that are still valid, add new ones at end, remove invalid ones
    const kept = currentRanking.filter(t => newThirds.includes(t));
    const added = newThirds.filter(t => !kept.includes(t));
    return [...kept, ...added];
  }, []);

  // Debounced auto-save
  const scheduleSave = useCallback((newStandings: Record<string, string[]>, newThirds: string[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/admin/staged/stages/${stageId}/group-result`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ standings: newStandings, thirdPlace: newThirds }),
        });
      } catch { /* silent */ }
    }, 1000);
  }, [stageId]);

  // Group drag handlers
  function onGroupDragStart(groupId: string, idx: number) {
    dragGroupRef.current = { groupId, fromIdx: idx };
  }

  function onGroupDragOver(e: React.DragEvent, groupId: string, toIdx: number) {
    e.preventDefault();
    const from = dragGroupRef.current;
    if (!from || from.groupId !== groupId || from.fromIdx === toIdx) return;
    setStandings(prev => {
      const arr = [...(prev[groupId] ?? [])];
      const [item] = arr.splice(from.fromIdx, 1);
      arr.splice(toIdx, 0, item);
      const updated = { ...prev, [groupId]: arr };
      const newThirds = syncThirds(updated, thirdRanking, groups);
      setThirdRanking(newThirds);
      scheduleSave(updated, newThirds);
      return updated;
    });
    dragGroupRef.current = { groupId, fromIdx: toIdx };
  }

  function onGroupDragEnd() {
    dragGroupRef.current = null;
  }

  // Third-place drag handlers
  function onThirdDragStart(idx: number) {
    dragThirdRef.current = idx;
  }

  function onThirdDragOver(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    const from = dragThirdRef.current;
    if (from === null || from === toIdx) return;
    setThirdRanking(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(toIdx, 0, item);
      scheduleSave(standings, arr);
      return arr;
    });
    dragThirdRef.current = toIdx;
  }

  function onThirdDragEnd() {
    dragThirdRef.current = null;
  }

  // Button-based reordering (drag-and-drop is awkward on touch devices).
  function moveGroupTeam(groupId: string, idx: number, dir: -1 | 1) {
    setStandings(prev => {
      const arr = [...(prev[groupId] ?? [])];
      const to = idx + dir;
      if (to < 0 || to >= arr.length) return prev;
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      const updated = { ...prev, [groupId]: arr };
      const newThirds = syncThirds(updated, thirdRanking, groups);
      setThirdRanking(newThirds);
      scheduleSave(updated, newThirds);
      return updated;
    });
  }

  function moveThird(idx: number, dir: -1 | 1) {
    setThirdRanking(prev => {
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      scheduleSave(standings, arr);
      return arr;
    });
  }

  // Lock results
  async function lockResults() {
    setLocking(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/admin/staged/stages/${stageId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupStandings: standings, selectedThirds: thirdRanking.slice(0, 8) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to lock results");
      setSuccessMsg(data.r32Generated ? "Stage locked and scored! R32 matches generated." : "Stage locked and scored!");
      onLocked();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error locking results");
    } finally {
      setLocking(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 py-4">Loading group data…</p>;
  }

  return (
    <div className="mt-4 space-y-6">
      {/* Groups grid */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest muted mb-3">Group Standings</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {groups.map(group => {
            const teamIds = standings[group.id] ?? [];
            return (
              <div key={group.id} className="rounded-2xl p-3" style={{ background: "var(--bg-strong)" }}>
                <p className="text-xs font-bold uppercase tracking-widest muted mb-2">Group {group.name}</p>
                <div className="space-y-1">
                  {teamIds.map((teamId, idx) => {
                    const team = teamMap[teamId];
                    if (!team) return null;
                    return (
                      <div
                        key={teamId}
                        draggable
                        onDragStart={() => onGroupDragStart(group.id, idx)}
                        onDragOver={e => onGroupDragOver(e, group.id, idx)}
                        onDragEnd={onGroupDragEnd}
                        className="flex items-center gap-2 rounded-xl px-2 py-1.5 cursor-grab active:cursor-grabbing select-none transition"
                        style={{ background: "var(--bg-elevated)" }}
                      >
                        <span className={`flex h-5 w-8 items-center justify-center rounded-full text-[9px] font-bold shrink-0 ${POSITION_COLORS[idx] ?? "bg-gray-700 text-gray-300"}`}>
                          {POSITION_LABELS[idx] ?? idx + 1}
                        </span>
                        <TeamFlag code={team.fifaCode} size={16} />
                        <span className="text-xs font-medium truncate flex-1 min-w-0" style={{ color: "var(--ink)" }}>{team.name}</span>
                        <span className="flex shrink-0 flex-col">
                          <button
                            type="button" aria-label="Move up" disabled={idx === 0}
                            onClick={() => moveGroupTeam(group.id, idx, -1)}
                            className="flex h-3.5 w-5 items-center justify-center text-[9px] leading-none disabled:opacity-30"
                            style={{ color: "var(--muted)" }}
                          >▲</button>
                          <button
                            type="button" aria-label="Move down" disabled={idx === teamIds.length - 1}
                            onClick={() => moveGroupTeam(group.id, idx, 1)}
                            className="flex h-3.5 w-5 items-center justify-center text-[9px] leading-none disabled:opacity-30"
                            style={{ color: "var(--muted)" }}
                          >▼</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Third-place ranking */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest muted">Best Third-Place Teams</p>
          <span className="text-[10px] rounded-full px-2 py-0.5 font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
            Top 8 advance
          </span>
        </div>
        <div className="space-y-1.5 max-w-sm">
          {thirdRanking.map((teamId, idx) => {
            const team = teamMap[teamId];
            if (!team) return null;
            const advances = idx < 8;
            return (
              <div
                key={teamId}
                draggable
                onDragStart={() => onThirdDragStart(idx)}
                onDragOver={e => onThirdDragOver(e, idx)}
                onDragEnd={onThirdDragEnd}
                className="flex items-center gap-2 rounded-xl px-3 py-2 cursor-grab active:cursor-grabbing select-none transition"
                style={{
                  background: advances ? "var(--accent-soft)" : "var(--bg-elevated)",
                  border: advances ? "1px solid var(--accent)" : "1px solid var(--border)",
                }}
              >
                <span className="text-xs font-bold w-5 text-right shrink-0" style={{ color: advances ? "var(--accent-strong)" : "var(--muted)" }}>
                  {idx + 1}
                </span>
                <TeamFlag code={team.fifaCode} size={16} />
                <span className="text-xs font-medium flex-1 min-w-0 truncate" style={{ color: advances ? "var(--ink)" : "var(--muted)" }}>{team.name}</span>
                {advances && (
                  <span className="text-[10px] rounded-full px-1.5 py-0.5 font-bold shrink-0" style={{ background: "var(--accent)", color: "var(--accent-soft)" }}>ADV</span>
                )}
                <span className="flex shrink-0 flex-col">
                  <button
                    type="button" aria-label="Move up" disabled={idx === 0}
                    onClick={() => moveThird(idx, -1)}
                    className="flex h-3.5 w-5 items-center justify-center text-[9px] leading-none disabled:opacity-30"
                    style={{ color: advances ? "var(--accent-strong)" : "var(--muted)" }}
                  >▲</button>
                  <button
                    type="button" aria-label="Move down" disabled={idx === thirdRanking.length - 1}
                    onClick={() => moveThird(idx, 1)}
                    className="flex h-3.5 w-5 items-center justify-center text-[9px] leading-none disabled:opacity-30"
                    style={{ color: advances ? "var(--accent-strong)" : "var(--muted)" }}
                  >▼</button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feedback */}
      {error && <p className="rounded-xl bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</p>}
      {successMsg && <p className="rounded-xl bg-green-900/40 px-4 py-2 text-sm text-green-300">{successMsg}</p>}

      {/* Lock Results button */}
      {isClosedStage && !successMsg && (
        <div className="flex items-center gap-4">
          <button
            disabled={locking || thirdRanking.length < 8}
            onClick={lockResults}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-40 transition"
          >
            {locking ? "Locking…" : "Lock Results & Score Stage"}
          </button>
          {thirdRanking.length < 8 && (
            <p className="text-xs text-amber-400">Rank at least 8 third-place teams first</p>
          )}
        </div>
      )}
    </div>
  );
}
