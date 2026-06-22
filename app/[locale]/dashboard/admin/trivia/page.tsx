"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Link } from "@/lib/navigation";

type Localized = { en: string; es: string };
type OptionRow = { key: string; label: Localized };
type Question = {
  id: string;
  publishDate: string;
  prompt: Localized;
  options: OptionRow[];
  correctKey: string;
  points: number;
  _count?: { answers: number };
};

const EMPTY_OPTIONS: OptionRow[] = [
  { key: "A", label: { en: "", es: "" } },
  { key: "B", label: { en: "", es: "" } },
  { key: "C", label: { en: "", es: "" } },
  { key: "D", label: { en: "", es: "" } },
];

function isoDateOnly(value: string): string {
  return value.slice(0, 10);
}

export default function AdminTriviaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tournamentId = searchParams.get("tournamentId");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [tournamentName, setTournamentName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Form state (also used for editing — editingId set when editing an existing row).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [publishDate, setPublishDate] = useState("");
  const [promptEn, setPromptEn] = useState("");
  const [promptEs, setPromptEs] = useState("");
  const [options, setOptions] = useState<OptionRow[]>(EMPTY_OPTIONS);
  const [correctKey, setCorrectKey] = useState("A");
  const [points, setPoints] = useState(2);

  useEffect(() => {
    if (status === "authenticated" && (session?.user as { role?: string })?.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  const query = tournamentId ? `?tournamentId=${tournamentId}` : "";

  async function load() {
    const res = await fetch(`/api/admin/trivia${query}`);
    if (!res.ok) { setError("Could not load trivia questions."); return; }
    const data = await res.json();
    setQuestions(data.questions ?? []);
    setTournamentName(data.tournament?.name ?? "");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  function resetForm() {
    setEditingId(null);
    setPublishDate("");
    setPromptEn("");
    setPromptEs("");
    setOptions(EMPTY_OPTIONS.map((o) => ({ key: o.key, label: { ...o.label } })));
    setCorrectKey("A");
    setPoints(2);
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setPublishDate(isoDateOnly(q.publishDate));
    setPromptEn(q.prompt.en ?? "");
    setPromptEs(q.prompt.es ?? "");
    setOptions(q.options.map((o) => ({ key: o.key, label: { en: o.label.en ?? "", es: o.label.es ?? "" } })));
    setCorrectKey(q.correctKey);
    setPoints(q.points);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setOptionLabel(idx: number, lang: "en" | "es", value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, label: { ...o.label, [lang]: value } } : o)));
  }

  async function save() {
    setMessage("");
    setError("");
    const payload = {
      tournamentId,
      id: editingId ?? undefined,
      publishDate,
      prompt: { en: promptEn, es: promptEs },
      options: options.filter((o) => o.key.trim() && o.label.en.trim()),
      correctKey,
      points,
    };
    const res = await fetch("/api/admin/trivia", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Save failed."); return; }
    setMessage(editingId ? "Question updated." : "Question created.");
    resetForm();
    void load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this question and all its answers?")) return;
    const res = await fetch(`/api/admin/trivia?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setError("Delete failed."); return; }
    setMessage("Question deleted.");
    if (editingId === id) resetForm();
    void load();
  }

  const inputStyle = { borderColor: "var(--border)", background: "var(--bg)" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Daily Trivia{tournamentName ? ` · ${tournamentName}` : ""}</p>
          <h2 className="display-title text-3xl">Question authoring</h2>
        </div>
        <Link href="/dashboard/admin" className="btn btn-sm" style={inputStyle}>← Admin</Link>
      </div>

      {message ? <div className="rounded-[1.2rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--accent-soft)" }}>{message}</div> : null}
      {error ? <div className="rounded-[1.2rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</div> : null}

      {/* Authoring form */}
      <div className="surface rounded-[2rem] p-6 md:p-8 space-y-4">
        <h3 className="text-xl font-extrabold">{editingId ? "Edit question" : "New question"}</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="muted text-xs font-semibold uppercase tracking-[0.16em]">Publish date (UTC)</span>
            <input type="date" className="field mt-1 w-full" style={inputStyle} value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="muted text-xs font-semibold uppercase tracking-[0.16em]">Points</span>
            <input type="number" min={1} className="field mt-1 w-full" style={inputStyle} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="muted text-xs font-semibold uppercase tracking-[0.16em]">Question (English)</span>
            <input className="field mt-1 w-full" style={inputStyle} value={promptEn} onChange={(e) => setPromptEn(e.target.value)} placeholder="Which country won the 2022 World Cup?" />
          </label>
          <label className="block text-sm">
            <span className="muted text-xs font-semibold uppercase tracking-[0.16em]">Question (Spanish)</span>
            <input className="field mt-1 w-full" style={inputStyle} value={promptEs} onChange={(e) => setPromptEs(e.target.value)} placeholder="¿Qué país ganó el Mundial 2022?" />
          </label>
        </div>

        <div className="space-y-2">
          <span className="muted text-xs font-semibold uppercase tracking-[0.16em]">Options (pick the correct one)</span>
          {options.map((o, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2 rounded-[1rem] border p-2" style={inputStyle}>
              <input type="radio" name="correct" checked={correctKey === o.key} onChange={() => setCorrectKey(o.key)} aria-label={`Mark ${o.key} correct`} />
              <input className="field w-16" style={inputStyle} value={o.key} onChange={(e) => setOptions((prev) => prev.map((p, i) => (i === idx ? { ...p, key: e.target.value } : p)))} placeholder="Key" />
              <input className="field min-w-[160px] flex-1" style={inputStyle} value={o.label.en} onChange={(e) => setOptionLabel(idx, "en", e.target.value)} placeholder="English label" />
              <input className="field min-w-[160px] flex-1" style={inputStyle} value={o.label.es} onChange={(e) => setOptionLabel(idx, "es", e.target.value)} placeholder="Spanish label" />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-accent" type="button" onClick={() => void save()}>{editingId ? "Save changes" : "Create question"}</button>
          {editingId ? <button className="btn" type="button" style={inputStyle} onClick={resetForm}>Cancel</button> : null}
        </div>
      </div>

      {/* Existing questions */}
      <div className="surface rounded-[2rem] p-6 md:p-8">
        <h3 className="text-xl font-extrabold">Scheduled questions ({questions.length})</h3>
        <div className="mt-4 space-y-3">
          {questions.length === 0 ? (
            <p className="muted text-sm">No questions yet.</p>
          ) : questions.map((q) => (
            <article key={q.id} className="rounded-[1.2rem] border p-4" style={inputStyle}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] muted">{isoDateOnly(q.publishDate)} · {q.points} pts · {q._count?.answers ?? 0} answers</p>
                  <p className="mt-1 font-bold">{q.prompt.en}</p>
                  <p className="muted mt-1 text-sm">
                    {q.options.map((o) => `${o.key === q.correctKey ? "✓ " : ""}${o.label.en}`).join("  ·  ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-sm" type="button" style={inputStyle} onClick={() => startEdit(q)}>Edit</button>
                  <button className="btn btn-sm" type="button" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} onClick={() => void remove(q.id)}>Delete</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
