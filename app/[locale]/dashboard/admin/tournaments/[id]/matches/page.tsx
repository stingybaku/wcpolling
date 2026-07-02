"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TeamFlag } from "@/components/team-flag";

type Team = { id: string; name: string; fifaCode: string };
type Match = {
  id: string;
  round: "GROUP" | "R32" | "R16" | "QF" | "SF" | "FINAL";
  groupName: string | null;
  matchNumber: number;
  status: "SCHEDULED" | "FINISHED";
  homeScore: number | null;
  awayScore: number | null;
  homeYellow: number;
  awayYellow: number;
  homeRed: number;
  awayRed: number;
  penaltyShootout: boolean;
  homePenalties: number | null;
  awayPenalties: number | null;
  homeTeam: Team;
  awayTeam: Team;
};

type TieBreaker = { id: string; prompt: { en?: string; es?: string } | string; metric: string | null };

const METRIC_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— none —" },
  { value: "TOTAL_GOALS", label: "Total goals (tournament)" },
  { value: "FINAL_GOALS", label: "Goals in the Final" },
  { value: "PENALTY_SHOOTOUTS", label: "Penalty shootouts" },
  { value: "RED_CARDS", label: "Total red cards" },
];

function promptText(p: TieBreaker["prompt"]): string {
  if (typeof p === "string") return p;
  return p?.en ?? p?.es ?? "";
}

const ROUND_LABEL: Record<Match["round"], string> = {
  GROUP: "Group Stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-Finals",
  SF: "Semi-Finals",
  FINAL: "Final",
};
const ROUND_ORDER: Match["round"][] = ["GROUP", "R32", "R16", "QF", "SF", "FINAL"];

function numOrEmpty(v: number | null): string {
  return v === null || v === undefined ? "" : String(v);
}

export default function AdminMatchResultsPage() {
  const params = useParams<{ id: string; locale: string }>();
  const tournamentId = params.id;

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [tieBreakers, setTieBreakers] = useState<TieBreaker[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");

  async function load() {
    const res = await fetch(`/api/admin/staged/tournaments/${tournamentId}/match-results`);
    if (!res.ok) { setError("Failed to load matches."); setLoading(false); return; }
    const data = await res.json();
    setMatches(data.matches ?? []);
    setLoading(false);
  }

  async function loadTieBreakers() {
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/tiebreakers`);
    if (!res.ok) return;
    const data = await res.json();
    setTieBreakers(data.questions ?? []);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); void loadTieBreakers(); }, []);

  async function setMetric(questionId: string, metric: string) {
    setTieBreakers((prev) => prev.map((q) => (q.id === questionId ? { ...q, metric: metric || null } : q)));
    await fetch(`/api/admin/tournaments/${tournamentId}/tiebreakers`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, metric: metric || null }),
    });
  }

  async function generate() {
    setGenerating(true); setError(""); setMsg("");
    const res = await fetch(`/api/admin/staged/tournaments/${tournamentId}/match-results`, { method: "POST" });
    setGenerating(false);
    if (!res.ok) { setError("Could not generate fixtures."); return; }
    const data = await res.json();
    const resynced = data.knockoutResynced ? `, ${data.knockoutResynced} re-synced` : "";
    const removed = data.knockoutRemoved ? `, ${data.knockoutRemoved} stale removed` : "";
    setMsg(`Synced fixtures: +${data.groups} group, +${data.knockout} knockout${resynced}${removed}.`);
    await load();
  }

  async function pullResults(withCards: boolean) {
    setPulling(true); setError(""); setMsg("");
    const res = await fetch(
      `/api/admin/staged/tournaments/${tournamentId}/pull-results${withCards ? "?cards=1" : ""}`,
      { method: "POST" },
    );
    setPulling(false);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) { setError(data?.error ?? "Could not pull results."); return; }
    const cards = data.cardsFetched ? ", cards included" : "";
    let text = `Pulled from ${data.provider}: ${data.updated} updated, ${data.unchanged} unchanged${cards}.`;
    if (data.unmatched?.length) {
      text += ` ${data.unmatched.length} unmatched — ${data.unmatched.slice(0, 3).join("; ")}${data.unmatched.length > 3 ? "…" : ""}`;
    }
    setMsg(text);
    await load();
    await loadTieBreakers();
  }

  function patchLocal(id: string, patch: Partial<Match>) {
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function save(m: Match) {
    setSavingId(m.id); setError(""); setMsg("");
    const res = await fetch(`/api/admin/match-results/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        homeScore: m.homeScore, awayScore: m.awayScore,
        homeYellow: m.homeYellow, awayYellow: m.awayYellow,
        homeRed: m.homeRed, awayRed: m.awayRed,
        penaltyShootout: m.penaltyShootout,
        homePenalties: m.homePenalties, awayPenalties: m.awayPenalties,
        status: m.status,
      }),
    });
    setSavingId(null);
    if (!res.ok) { setError("Could not save match."); return; }
    const data = await res.json();
    const tb = Object.keys(data.tieBreakers ?? {}).length;
    setMsg(`Saved.${tb ? ` Tie-breakers updated (${tb}).` : ""}`);
  }

  const byRound = ROUND_ORDER.map((round) => ({
    round,
    matches: matches.filter((m) => m.round === round),
  })).filter((r) => r.matches.length > 0);

  const numInput = (value: number | null, onChange: (n: number | null) => void, width = 52) => (
    <input
      type="number" min={0} value={numOrEmpty(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))))}
      style={{
        width, textAlign: "center", padding: "6px 6px", borderRadius: 8,
        border: "1px solid var(--border)", background: "var(--paper-strong)",
        color: "var(--ink)", fontSize: 14,
      }}
    />
  );

  const groupNames = Array.from(
    new Set(matches.filter((m) => m.round === "GROUP" && m.groupName).map((m) => m.groupName as string)),
  ).sort();

  const knockoutRounds = byRound.filter((r) => r.round !== "GROUP");
  const tabs = [
    ...groupNames.map((g) => ({ key: `group:${g}`, label: `Group ${g}` })),
    ...knockoutRounds.map((r) => ({ key: `round:${r.round}`, label: ROUND_LABEL[r.round] })),
  ];
  const currentTab = tabs.find((t) => t.key === activeTab)?.key ?? tabs[0]?.key ?? "";
  const currentMatches: Match[] = currentTab.startsWith("group:")
    ? matches.filter((m) => m.round === "GROUP" && m.groupName === currentTab.slice("group:".length))
    : currentTab.startsWith("round:")
      ? matches.filter((m) => m.round === currentTab.slice("round:".length))
      : [];

  const matchCard = (m: Match) => (
    <div key={m.id} className="rounded-2xl p-3" style={{ background: "var(--bg-strong)" }}>
      <div className="flex flex-wrap items-center gap-2">
        {m.groupName && <span className="text-[10px] font-bold muted" style={{ width: 52 }}>Grp {m.groupName}</span>}
        <span className="flex items-center gap-1.5" style={{ minWidth: 150, justifyContent: "flex-end", flex: 1 }}>
          <span className="text-xs font-medium" style={{ color: "var(--ink)" }}>{m.homeTeam.name}</span>
          <TeamFlag code={m.homeTeam.fifaCode} size={16} />
        </span>
        {numInput(m.homeScore, (n) => patchLocal(m.id, { homeScore: n }))}
        <span className="muted">–</span>
        {numInput(m.awayScore, (n) => patchLocal(m.id, { awayScore: n }))}
        <span className="flex items-center gap-1.5" style={{ minWidth: 150, flex: 1 }}>
          <TeamFlag code={m.awayTeam.fifaCode} size={16} />
          <span className="text-xs font-medium" style={{ color: "var(--ink)" }}>{m.awayTeam.name}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] muted">
        <span className="flex items-center gap-1">🟨 {numInput(m.homeYellow, (n) => patchLocal(m.id, { homeYellow: n ?? 0 }), 44)}/{numInput(m.awayYellow, (n) => patchLocal(m.id, { awayYellow: n ?? 0 }), 44)}</span>
        <span className="flex items-center gap-1">🟥 {numInput(m.homeRed, (n) => patchLocal(m.id, { homeRed: n ?? 0 }), 44)}/{numInput(m.awayRed, (n) => patchLocal(m.id, { awayRed: n ?? 0 }), 44)}</span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={m.penaltyShootout} onChange={(e) => patchLocal(m.id, { penaltyShootout: e.target.checked })} /> Pens
        </label>
        {m.penaltyShootout && (
          <span className="flex items-center gap-1">{numInput(m.homePenalties, (n) => patchLocal(m.id, { homePenalties: n }), 44)}–{numInput(m.awayPenalties, (n) => patchLocal(m.id, { awayPenalties: n }), 44)}</span>
        )}
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={m.status === "FINISHED"} onChange={(e) => patchLocal(m.id, { status: e.target.checked ? "FINISHED" : "SCHEDULED" })} /> Finished
        </label>
        <button className="btn btn-sm btn-accent ml-auto" onClick={() => void save(m)} disabled={savingId === m.id}>
          {savingId === m.id ? "…" : "Save"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6" style={{ padding: 24 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest muted">Match Results</p>
          <h1 className="text-2xl font-extrabold" style={{ color: "var(--ink)" }}>Track every match</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/admin/tournaments/${tournamentId}/staged`} className="btn btn-sm btn-ghost">← Staged admin</Link>
          <button className="btn btn-sm btn-ghost" onClick={() => void generate()} disabled={generating}>
            {generating ? "Syncing…" : "Generate / sync fixtures"}
          </button>
          <button
            className="btn btn-sm btn-accent"
            onClick={() => void pullResults(false)}
            disabled={pulling}
            title="Fetch scores, shootouts and status from the configured provider onto existing fixtures. Stage results stay manual."
          >
            {pulling ? "Pulling…" : "Pull results"}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => void pullResults(true)}
            disabled={pulling}
            title="Also fetch yellow/red card counts (uses one extra provider request per finished match)."
          >
            + cards
          </button>
        </div>
      </div>

      {msg && <p className="rounded-xl px-4 py-2 text-sm" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>{msg}</p>}
      {error && <p className="rounded-xl px-4 py-2 text-sm" style={{ background: "rgba(220,38,38,.15)", color: "var(--danger)" }}>{error}</p>}

      {tieBreakers.length > 0 && (
        <section className="rounded-2xl p-4" style={{ background: "var(--bg-strong)" }}>
          <p className="text-xs font-bold uppercase tracking-widest muted mb-1">Tie-breaker auto-resolution</p>
          <p className="text-[11px] muted mb-3">Map a question to a match stat and its answer is filled automatically from finished matches when you save a result.</p>
          <div className="space-y-2">
            {tieBreakers.map((q) => (
              <div key={q.id} className="flex flex-wrap items-center gap-2">
                <span className="text-xs flex-1 min-w-[180px]" style={{ color: "var(--ink)" }}>{promptText(q.prompt)}</span>
                <select
                  className="field text-xs"
                  value={q.metric ?? ""}
                  onChange={(e) => void setMetric(q.id, e.target.value)}
                >
                  {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <p className="muted text-sm">Loading…</p>
      ) : matches.length === 0 ? (
        <p className="muted text-sm">No fixtures yet — click “Generate / sync fixtures”. Group matches come from the seeded groups; knockout matches sync from the bracket as rounds resolve.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1" role="tablist">
            {tabs.map((t) => {
              const active = t.key === currentTab;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(t.key)}
                  className="rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap"
                  style={{
                    background: active ? "var(--accent-strong)" : "var(--bg-strong)",
                    color: active ? "var(--paper)" : "var(--ink)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <section className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-strong)" }}>
              {tabs.find((t) => t.key === currentTab)?.label}
            </p>
            <div className="space-y-2">{currentMatches.map(matchCard)}</div>
          </section>
        </>
      )}
    </div>
  );
}
