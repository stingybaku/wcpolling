"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StageStatus = "UPCOMING" | "OPEN" | "CLOSED" | "SCORED";
type StageType = "GROUP_QUALIFICATION" | "KNOCKOUT";

type Stage = {
  id: string;
  name: string;
  type: StageType;
  status: StageStatus;
  order: number;
  roundLabel?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  submittedCount: number;
};

type StagedTournament = {
  id: string;
  name: string;
  type: string;
  stages: Stage[];
  activeMemberCount: number;
};

type Team = {
  id: string;
  name: string;
  fifaCode: string;
};

type StageMatch = {
  id: string;
  matchNumber: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  scheduledAt?: string | null;
  homeTeam?: { id: string; name: string; fifaCode: string } | null;
  awayTeam?: { id: string; name: string; fifaCode: string } | null;
};

type MatchRow = {
  clientId: string;
  id?: string;
  matchNumber: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
};

type Modal =
  | { type: "matchEntry"; stage: Stage }
  | { type: "resultEntry"; stage: Stage }
  | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inferMatchCount(roundLabel?: string | null): number {
  if (!roundLabel) return 4;
  const lower = roundLabel.toLowerCase();
  if (lower.includes("32") || lower.includes("r32")) return 16;
  if (lower.includes("16") || lower.includes("r16")) return 8;
  if (lower.includes("quarter") || lower.includes("qf")) return 4;
  if (lower.includes("semi") || lower.includes("sf")) return 2;
  if (lower.includes("final")) return 1;
  return 4;
}

function getStatusBadge(status: StageStatus) {
  const base = "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest";
  switch (status) {
    case "UPCOMING": return `${base} bg-gray-700 text-gray-200`;
    case "OPEN": return `${base} bg-green-700 text-green-100`;
    case "CLOSED": return `${base} bg-amber-700 text-amber-100`;
    case "SCORED": return `${base} bg-indigo-700 text-indigo-100`;
  }
}

function useCountdown(closesAt?: string | null) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!closesAt) { setRemaining(""); return; }
    const update = () => {
      const diff = new Date(closesAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Closed"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [closesAt]);
  return remaining;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBar({
  tournament,
}: {
  tournament: StagedTournament;
}) {
  const current = [...tournament.stages].sort((a, b) => a.order - b.order).find(
    (s) => s.status === "OPEN" || s.status === "UPCOMING"
  ) ?? tournament.stages[tournament.stages.length - 1];

  const now = Date.now();
  const deadlineDiff = current?.closesAt ? new Date(current.closesAt).getTime() - now : null;
  const deadlineLabel =
    deadlineDiff === null
      ? "—"
      : deadlineDiff < 0
      ? "Passed"
      : (() => {
          const h = Math.floor(deadlineDiff / 3_600_000);
          const m = Math.floor((deadlineDiff % 3_600_000) / 60_000);
          return `${h}h ${m}m`;
        })();

  const totalGroups = tournament.stages.length;

  return (
    <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
      {[
        { label: "Current Stage", value: current?.name ?? "—" },
        { label: "Deadline", value: deadlineLabel },
        { label: "Total Stages", value: String(totalGroups) },
        { label: "Active Members", value: String(tournament.activeMemberCount) },
      ].map(({ label, value }) => (
        <div
          key={label}
          className="rounded-2xl p-4"
          style={{ background: "var(--bg-strong)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">{label}</p>
          <p className="mt-1 text-xl font-bold text-white truncate">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  requireInput,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  requireInput?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");
  const ready = requireInput ? input === requireInput : true;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
        style={{ background: "var(--bg-surface, #1e1e2e)" }}
      >
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-2 text-sm text-gray-400">{description}</p>
        {requireInput && (
          <div className="mt-4">
            <label className="text-xs text-gray-400">
              Type <span className="font-mono text-amber-400">{requireInput}</span> to confirm
            </label>
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              placeholder={requireInput}
            />
          </div>
        )}
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white transition"
            style={{ background: "var(--bg-strong, #2a2a3e)" }}
          >
            Cancel
          </button>
          <button
            disabled={!ready}
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${
              destructive
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialogWrapper(props: Parameters<typeof ConfirmDialog>[0]) {
  return <ConfirmDialog {...props} />;
}

// ─── Match Entry Modal ────────────────────────────────────────────────────────

function MatchEntryModal({
  stage,
  teams,
  onClose,
  onSaved,
}: {
  stage: Stage;
  teams: Team[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultCount = inferMatchCount(stage.roundLabel);
  const [rows, setRows] = useState<MatchRow[]>(() =>
    Array.from({ length: defaultCount }, (_, i) => ({
      clientId: uid(),
      matchNumber: "",
      homeTeamId: "",
      awayTeamId: "",
      scheduledAt: "",
    }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [teamSearch, setTeamSearch] = useState("");

  useEffect(() => {
    fetch(`/api/admin/staged/stages/${stage.id}/matches`)
      .then((r) => r.json())
      .then((data) => {
        const existing: StageMatch[] = data.matches ?? [];
        if (existing.length > 0) {
          setRows(
            existing.map((m) => ({
              clientId: uid(),
              id: m.id,
              matchNumber: m.matchNumber,
              homeTeamId: m.homeTeamId ?? "",
              awayTeamId: m.awayTeamId ?? "",
              scheduledAt: m.scheduledAt ? toDatetimeLocal(m.scheduledAt) : "",
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [stage.id]);

  const updateRow = (clientId: string, patch: Partial<MatchRow>) => {
    setRows((prev) => prev.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
  };

  const saveRow = async (row: MatchRow) => {
    setSaving((s) => ({ ...s, [row.clientId]: true }));
    setErrors((e) => ({ ...e, [row.clientId]: "" }));
    try {
      const res = await fetch(`/api/admin/staged/stages/${stage.id}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          matchNumber: row.matchNumber,
          homeTeamId: row.homeTeamId || null,
          awayTeamId: row.awayTeamId || null,
          scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save match");
      if (data.match?.id) {
        setRows((prev) => prev.map((r) => (r.clientId === row.clientId ? { ...r, id: data.match.id } : r)));
      }
    } catch (err: unknown) {
      setErrors((e) => ({ ...e, [row.clientId]: err instanceof Error ? err.message : "Error" }));
    } finally {
      setSaving((s) => ({ ...s, [row.clientId]: false }));
    }
  };

  const filteredTeams = teams.filter((t) =>
    teamSearch === "" ||
    t.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
    t.fifaCode.toLowerCase().includes(teamSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10">
      <div
        className="w-full max-w-4xl rounded-3xl p-6 shadow-2xl"
        style={{ background: "var(--bg-surface, #1e1e2e)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Enter Matches — {stage.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="mb-4">
          <input
            placeholder="Search teams..."
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm py-8 text-center">Loading matches...</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.clientId}
                className="grid grid-cols-[1fr_2fr_2fr_1.5fr_auto] gap-2 items-center rounded-2xl p-3"
                style={{ background: "var(--bg-strong, #2a2a3e)" }}
              >
                <input
                  value={row.matchNumber}
                  onChange={(e) => updateRow(row.clientId, { matchNumber: e.target.value })}
                  placeholder="M73"
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-white/30"
                />
                <select
                  value={row.homeTeamId}
                  onChange={(e) => updateRow(row.clientId, { homeTeamId: e.target.value })}
                  className="rounded-lg border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-white outline-none focus:border-white/30"
                >
                  <option value="">— Home Team —</option>
                  {(teamSearch ? filteredTeams : teams).map((t) => (
                    <option key={t.id} value={t.id}>{t.fifaCode} — {t.name}</option>
                  ))}
                </select>
                <select
                  value={row.awayTeamId}
                  onChange={(e) => updateRow(row.clientId, { awayTeamId: e.target.value })}
                  className="rounded-lg border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-white outline-none focus:border-white/30"
                >
                  <option value="">— Away Team —</option>
                  {(teamSearch ? filteredTeams : teams).map((t) => (
                    <option key={t.id} value={t.id}>{t.fifaCode} — {t.name}</option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  value={row.scheduledAt}
                  onChange={(e) => updateRow(row.clientId, { scheduledAt: e.target.value })}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-white/30"
                />
                <button
                  disabled={saving[row.clientId]}
                  onClick={() => saveRow(row)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-40 transition whitespace-nowrap"
                >
                  {saving[row.clientId] ? "Saving…" : "Save"}
                </button>
                {errors[row.clientId] && (
                  <p className="col-span-5 text-xs text-red-400">{errors[row.clientId]}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { clientId: uid(), matchNumber: "", homeTeamId: "", awayTeamId: "", scheduledAt: "" },
              ])
            }
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white transition"
          >
            + Add Row
          </button>
          <button
            onClick={onClose}
            className="ml-auto rounded-xl px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white transition"
            style={{ background: "var(--bg-strong, #2a2a3e)" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Result Entry Modal ───────────────────────────────────────────────────────

function ResultEntryModal({
  stage,
  onClose,
  onSaved,
}: {
  stage: Stage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isGroup = stage.type === "GROUP_QUALIFICATION";
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<StageMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [qualifiers, setQualifiers] = useState<Set<string>>(new Set());
  const [winners, setWinners] = useState<Record<string, string>>({});
  const [teamSearch, setTeamSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const fetches = isGroup
      ? [fetch("/api/admin/teams").then((r) => r.json()).then((d) => setTeams(d.teams ?? []))]
      : [fetch(`/api/admin/staged/stages/${stage.id}/matches`).then((r) => r.json()).then((d) => setMatches(d.matches ?? []))];
    Promise.all(fetches)
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  }, [stage.id, isGroup]);

  const toggleQualifier = (teamId: string) => {
    setQualifiers((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body = isGroup
        ? { qualifiers: Array.from(qualifiers) }
        : { results: Object.entries(winners).map(([matchId, winnerId]) => ({ matchId, winnerId })) };

      const res = await fetch(`/api/admin/staged/stages/${stage.id}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save results");
      setSuccess("Results saved!");
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving results");
    } finally {
      setSaving(false);
    }
  };

  const filteredTeams = teams.filter((t) =>
    teamSearch === "" ||
    t.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
    t.fifaCode.toLowerCase().includes(teamSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10">
      <div
        className="w-full max-w-2xl rounded-3xl p-6 shadow-2xl"
        style={{ background: "var(--bg-surface, #1e1e2e)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Enter Results — {stage.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {error && <p className="mb-3 rounded-xl bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</p>}
        {success && <p className="mb-3 rounded-xl bg-green-900/40 px-4 py-2 text-sm text-green-300">{success}</p>}

        {isGroup && loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading teams...</p>
        ) : isGroup ? (
          <>
            <p className="text-sm text-gray-400 mb-3">
              Select the <strong className="text-white">32 teams</strong> that qualify from the group stage.
              <span className="ml-2 font-bold text-amber-400">{qualifiers.size} / 32 selected</span>
            </p>
            <input
              placeholder="Search teams..."
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
            <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
              {filteredTeams.map((t) => {
                const selected = qualifiers.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleQualifier(t.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                      selected
                        ? "bg-indigo-700 text-white"
                        : "bg-white/5 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                        selected ? "border-white bg-white text-indigo-700" : "border-gray-600"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span className="font-mono text-xs text-gray-400 w-8">{t.fifaCode}</span>
                    <span>{t.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-2xl p-3"
                style={{ background: "var(--bg-strong, #2a2a3e)" }}
              >
                <span className="text-xs font-mono text-gray-400 w-10">{m.matchNumber}</span>
                <div className="flex flex-1 items-center gap-2">
                  <label className={`flex flex-1 cursor-pointer items-center justify-end gap-2 rounded-lg px-2 py-1.5 text-sm transition ${winners[m.id] === m.homeTeamId ? "bg-green-700/50 text-white" : "text-gray-300 hover:bg-white/5"}`}>
                    <span>{m.homeTeam?.name ?? m.homeTeamId ?? "Home"}</span>
                    <input
                      type="radio"
                      name={`winner-${m.id}`}
                      value={m.homeTeamId ?? ""}
                      checked={winners[m.id] === m.homeTeamId}
                      onChange={() => setWinners((w) => ({ ...w, [m.id]: m.homeTeamId! }))}
                      className="accent-green-500"
                    />
                  </label>
                  <span className="text-gray-500 font-bold text-xs">vs</span>
                  <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${winners[m.id] === m.awayTeamId ? "bg-green-700/50 text-white" : "text-gray-300 hover:bg-white/5"}`}>
                    <input
                      type="radio"
                      name={`winner-${m.id}`}
                      value={m.awayTeamId ?? ""}
                      checked={winners[m.id] === m.awayTeamId}
                      onChange={() => setWinners((w) => ({ ...w, [m.id]: m.awayTeamId! }))}
                      className="accent-green-500"
                    />
                    <span>{m.awayTeam?.name ?? m.awayTeamId ?? "Away"}</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white transition"
            style={{ background: "var(--bg-strong, #2a2a3e)" }}
          >
            Cancel
          </button>
          <button
            disabled={saving || (isGroup && qualifiers.size === 0) || (!isGroup && Object.keys(winners).length === 0)}
            onClick={save}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-40 transition"
          >
            {saving ? "Saving…" : "Save All Results"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stage Card ───────────────────────────────────────────────────────────────

function StageCard({
  stage,
  tournamentId,
  teams,
  onRefresh,
}: {
  stage: Stage;
  tournamentId: string;
  teams: Team[];
  onRefresh: () => void;
}) {
  const [opensAt, setOpensAt] = useState(toDatetimeLocal(stage.opensAt));
  const [closesAt, setClosesAt] = useState(toDatetimeLocal(stage.closesAt));
  const [editingDates, setEditingDates] = useState(false);
  const [editingCloseDate, setEditingCloseDate] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [dateError, setDateError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [confirm, setConfirm] = useState<null | "open" | "close" | "score" | "reset">(null);
  const [modal, setModal] = useState<"matchEntry" | "resultEntry" | null>(null);
  const [hasMatches, setHasMatches] = useState<boolean | null>(null);
  const countdown = useCountdown(stage.status === "OPEN" ? stage.closesAt : null);

  // Check if KNOCKOUT stage has matches entered
  useEffect(() => {
    if (stage.type === "KNOCKOUT" && stage.status === "UPCOMING") {
      fetch(`/api/admin/staged/stages/${stage.id}/matches`)
        .then((r) => r.json())
        .then((d) => setHasMatches((d.matches ?? []).length > 0))
        .catch(() => setHasMatches(false));
    }
  }, [stage.id, stage.type, stage.status]);

  const saveDates = async () => {
    setSavingDates(true);
    setDateError("");
    try {
      const res = await fetch(`/api/admin/staged/stages/${stage.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opensAt: opensAt ? new Date(opensAt).toISOString() : null,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save dates");
      setEditingDates(false);
      setEditingCloseDate(false);
      onRefresh();
    } catch (err: unknown) {
      setDateError(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingDates(false);
    }
  };

  const doAction = async (endpoint: string) => {
    setActionError("");
    setActionSuccess("");
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setActionSuccess("Done!");
      setTimeout(() => setActionSuccess(""), 3000);
      onRefresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <>
      {modal === "matchEntry" && (
        <MatchEntryModal
          stage={stage}
          teams={teams}
          onClose={() => setModal(null)}
          onSaved={() => { setHasMatches(true); setModal(null); }}
        />
      )}
      {modal === "resultEntry" && (
        <ResultEntryModal
          stage={stage}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onRefresh(); }}
        />
      )}

      {confirm === "open" && (
        <ConfirmDialogWrapper
          title={`Open "${stage.name}"?`}
          description="This will open the stage for submissions. Members will be notified."
          confirmLabel="Open Stage"
          onConfirm={() => { setConfirm(null); doAction(`/api/admin/staged/stages/${stage.id}/open`); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "close" && (
        <ConfirmDialogWrapper
          title={`Close "${stage.name}" early?`}
          description="This will immediately close the stage. No more submissions will be accepted."
          confirmLabel="Close Stage"
          destructive
          onConfirm={() => { setConfirm(null); doAction(`/api/admin/staged/stages/${stage.id}/close`); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "score" && (
        <ConfirmDialogWrapper
          title={`Score "${stage.name}"?`}
          description="This will calculate scores for all submissions in this stage. Make sure results are entered correctly."
          confirmLabel="Score Stage"
          onConfirm={() => { setConfirm(null); doAction(`/api/admin/staged/stages/${stage.id}/score`); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "reset" && (
        <ConfirmDialogWrapper
          title={`Reset "${stage.name}"?`}
          description="This will reset the stage to UPCOMING status. All submissions and scores for this stage will be cleared."
          confirmLabel="Reset Stage"
          destructive
          requireInput={stage.name}
          onConfirm={() => { setConfirm(null); doAction(`/api/admin/staged/stages/${stage.id}/reset`); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div
        className="rounded-3xl p-6 shadow"
        style={{ background: "var(--bg-surface, #1e1e2e)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-xs font-mono text-gray-500">#{stage.order + 1}</span>
          <h3 className="text-base font-bold text-white">{stage.name}</h3>
          <span className={getStatusBadge(stage.status)}>{stage.status}</span>
          {stage.roundLabel && (
            <span className="text-xs text-gray-500 italic">{stage.roundLabel}</span>
          )}
          <span className="ml-auto text-xs text-gray-500 uppercase tracking-wider">{stage.type}</span>
        </div>

        {/* Status-specific content */}
        {stage.status === "UPCOMING" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Opens</p>
                <p className="text-gray-300">{formatDate(stage.opensAt)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Closes</p>
                <p className="text-gray-300">{formatDate(stage.closesAt)}</p>
              </div>
            </div>

            {editingDates ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Opens At</label>
                    <input
                      type="datetime-local"
                      value={opensAt}
                      onChange={(e) => setOpensAt(e.target.value)}
                      className="mt-0.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Closes At</label>
                    <input
                      type="datetime-local"
                      value={closesAt}
                      onChange={(e) => setClosesAt(e.target.value)}
                      className="mt-0.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
                    />
                  </div>
                </div>
                {dateError && <p className="text-xs text-red-400">{dateError}</p>}
                <div className="flex gap-2">
                  <button
                    disabled={savingDates}
                    onClick={saveDates}
                    className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-40 transition"
                  >
                    {savingDates ? "Saving…" : "Save Dates"}
                  </button>
                  <button
                    onClick={() => { setEditingDates(false); setDateError(""); }}
                    className="rounded-xl px-4 py-1.5 text-xs font-semibold text-gray-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingDates(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                Edit Dates
              </button>
            )}

            <div className="flex flex-wrap gap-2">
              {stage.type === "KNOCKOUT" && (
                <button
                  onClick={() => setModal("matchEntry")}
                  className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white transition"
                >
                  Enter Matches
                </button>
              )}
              <button
                disabled={stage.type === "KNOCKOUT" && hasMatches === false}
                onClick={() => setConfirm("open")}
                title={stage.type === "KNOCKOUT" && !hasMatches ? "Enter matches first" : undefined}
                className="rounded-xl bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-600 disabled:opacity-40 transition"
              >
                Open Stage
              </button>
            </div>
          </div>
        )}

        {stage.status === "OPEN" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Closes in</p>
                <p className="text-lg font-mono font-bold text-green-400">{countdown || formatDate(stage.closesAt)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Submissions</p>
                <p className="text-lg font-bold text-white">{stage.submittedCount} submitted</p>
              </div>
            </div>

            {editingCloseDate ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500">New Close Date</label>
                  <input
                    type="datetime-local"
                    value={closesAt}
                    onChange={(e) => setClosesAt(e.target.value)}
                    className="mt-0.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
                  />
                </div>
                {dateError && <p className="text-xs text-red-400">{dateError}</p>}
                <div className="flex gap-2">
                  <button
                    disabled={savingDates}
                    onClick={saveDates}
                    className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-40 transition"
                  >
                    {savingDates ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => { setEditingCloseDate(false); setDateError(""); }}
                    className="rounded-xl px-4 py-1.5 text-xs font-semibold text-gray-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingCloseDate(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                Edit Close Date
              </button>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setConfirm("close")}
                className="rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition"
              >
                Close Early
              </button>
            </div>
          </div>
        )}

        {stage.status === "CLOSED" && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Submissions</p>
              <p className="text-lg font-bold text-white">{stage.submittedCount} submitted</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setModal("resultEntry")}
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white transition"
              >
                Enter Results
              </button>
              <button
                onClick={() => setConfirm("score")}
                className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition"
              >
                Score Stage
              </button>
              <a
                href={`/dashboard/admin/tournaments/${tournamentId}/stages/${stage.id}/submissions`}
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white transition inline-block"
              >
                View Submissions
              </a>
            </div>
          </div>
        )}

        {stage.status === "SCORED" && (
          <div className="space-y-2">
            <p className="text-sm text-gray-400">
              Stage scored. <span className="font-bold text-white">{stage.submittedCount}</span> submissions counted.
            </p>
            <p className="text-xs text-gray-600">No further actions available for scored stages.</p>
          </div>
        )}

        {/* Feedback */}
        {actionError && (
          <p className="mt-3 rounded-xl bg-red-900/40 px-3 py-2 text-xs text-red-300">{actionError}</p>
        )}
        {actionSuccess && (
          <p className="mt-3 rounded-xl bg-green-900/40 px-3 py-2 text-xs text-green-300">{actionSuccess}</p>
        )}

        {/* Reset button (for non-scored stages) */}
        {stage.status !== "SCORED" && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <button
              onClick={() => setConfirm("reset")}
              className="text-xs text-red-500 hover:text-red-400 transition"
            >
              Reset Stage
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StagedTournamentAdminPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string; locale: string }>();
  const id = params.id;

  const [tournament, setTournament] = useState<StagedTournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  // Auth guard
  useEffect(() => {
    if (authStatus === "loading") return;
    if ((session?.user as { role?: string } | undefined)?.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [session, authStatus, router]);

  const fetchTournament = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/staged/tournaments/${id}`);
      if (!res.ok) throw new Error("Failed to load tournament");
      const data = await res.json();
      setTournament(data.tournament);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tournament data");
    }
  }, [id]);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/teams");
      if (!res.ok) return;
      const data = await res.json();
      setTeams(data.teams ?? []);
    } catch {
      // teams are optional for now
    }
  }, []);

  useEffect(() => {
    if (authStatus === "loading" || (session?.user as { role?: string } | undefined)?.role !== "ADMIN") return;
    Promise.all([fetchTournament(), fetchTeams()]).finally(() => setLoading(false));
  }, [authStatus, session, fetchTournament, fetchTeams]);

  const resetTournament = async () => {
    setResetError("");
    setResetSuccess("");
    try {
      const res = await fetch(`/api/admin/staged/tournaments/${id}/reset`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset tournament");
      setResetSuccess("Tournament reset successfully.");
      fetchTournament();
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Error resetting tournament");
    }
  };

  if (authStatus === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400 text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="rounded-2xl bg-red-900/30 p-6 text-center">
          <p className="text-red-300 font-semibold">{error}</p>
          <button
            onClick={fetchTournament}
            className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!tournament) return null;

  const sortedStages = [...tournament.stages].sort((a, b) => a.order - b.order);

  return (
    <>
      {resetConfirm && (
        <ConfirmDialogWrapper
          title={`Reset tournament "${tournament.name}"?`}
          description="This will reset ALL stages back to UPCOMING. All submissions, matches, and scores for this tournament will be permanently cleared."
          confirmLabel="Reset Tournament"
          destructive
          requireInput={tournament.name}
          onConfirm={() => { setResetConfirm(false); resetTournament(); }}
          onCancel={() => setResetConfirm(false)}
        />
      )}

      <div className="min-h-screen px-4 py-8 md:px-8" style={{ background: "var(--bg-base, #13131f)" }}>
        <div className="mx-auto max-w-4xl">

          {/* Page header */}
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500 mb-1">
              Staged Tournament Admin
            </p>
            <h1 className="text-3xl font-bold text-white">{tournament.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{tournament.type}</p>
          </div>

          {/* Status bar */}
          <StatusBar tournament={tournament} />

          {/* Stage cards */}
          <div className="space-y-4 mb-10">
            {sortedStages.map((stage) => (
              <StageCard
                key={stage.id}
                stage={stage}
                tournamentId={id}
                teams={teams}
                onRefresh={fetchTournament}
              />
            ))}
          </div>

          {/* Danger zone */}
          <div
            className="rounded-3xl p-6"
            style={{ background: "var(--bg-surface, #1e1e2e)", border: "1px solid rgba(239,68,68,0.15)" }}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest text-red-500 mb-2">Danger Zone</h2>
            <p className="text-xs text-gray-500 mb-4">
              Resetting the tournament clears all stage data, submissions, matches, and scores. This cannot be undone.
            </p>
            {resetError && (
              <p className="mb-3 rounded-xl bg-red-900/40 px-4 py-2 text-sm text-red-300">{resetError}</p>
            )}
            {resetSuccess && (
              <p className="mb-3 rounded-xl bg-green-900/40 px-4 py-2 text-sm text-green-300">{resetSuccess}</p>
            )}
            <button
              onClick={() => setResetConfirm(true)}
              className="rounded-xl bg-red-800 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition"
            >
              Reset Tournament
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
