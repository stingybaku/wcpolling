"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type Localized = Record<string, string>;
type Option = { key: string; label: Localized };
type Question = { id: string; prompt: Localized; options: Option[]; points: number; correctKey: string | null };
type Stats = { totalPoints: number; answeredCount: number; correctCount: number; currentStreak: number };
type Triviador = { earned: boolean; threshold: number };

type TodayResponse = {
  tournament: { id: string; name: string };
  question: Question | null;
  answer: { answerKey: string; isCorrect: boolean } | null;
  stats: Stats;
  triviador: Triviador;
};

function pick(value: Localized, locale: string): string {
  return value[locale] ?? value.en ?? Object.values(value)[0] ?? "";
}

export default function TriviaPage() {
  const t = useTranslations("trivia");
  const locale = useLocale();

  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justEarned, setJustEarned] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/trivia/today");
      if (res.ok) setData(await res.json());
      setLoading(false);
    }
    void load();
  }, []);

  const answered = Boolean(data?.answer);
  const correctKey = data?.question?.correctKey ?? null;

  async function submit() {
    if (!selected || !data?.question || submitting) return;
    setSubmitting(true);
    const res = await fetch("/api/trivia/today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerKey: selected }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(result.error ?? t("submitError"));
      setSubmitting(false);
      return;
    }
    setJustEarned(Boolean(result.triviador?.justEarned));
    // Refresh from the server so the card reflects the recorded answer + reveal.
    const refreshed = await fetch("/api/trivia/today");
    if (refreshed.ok) setData(await refreshed.json());
    setSubmitting(false);
  }

  if (loading) {
    return <p className="muted text-sm">{t("loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("eyebrow")}</p>
          <h2 className="display-title text-3xl md:text-4xl">{t("title")}</h2>
          <p className="muted mt-2 text-sm">{t("subtitle", { points: data?.question?.points ?? 2 })}</p>
        </div>
        <Stats stats={data?.stats} triviador={data?.triviador} t={t} />
      </div>

      {justEarned && (
        <div className="rounded-[1.5rem] border px-5 py-4 text-sm font-semibold" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
          🏅 {t("triviadorEarned")}
        </div>
      )}

      {!data?.question ? (
        <div className="surface rounded-[2rem] p-8 text-center">
          <p className="text-lg font-bold">{t("noQuestionTitle")}</p>
          <p className="muted mt-2 text-sm">{t("noQuestionBody")}</p>
        </div>
      ) : (
        <div className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-lg font-bold md:text-xl">{pick(data.question.prompt, locale)}</p>

          <div className="mt-5 grid gap-3">
            {data.question.options.map((o) => {
              const isPicked = (answered ? data.answer?.answerKey : selected) === o.key;
              const isCorrect = answered && correctKey === o.key;
              const isWrongPick = answered && isPicked && correctKey !== o.key;
              const borderColor = isCorrect
                ? "var(--success, #10b981)"
                : isWrongPick
                  ? "var(--danger, #ef4444)"
                  : isPicked
                    ? "var(--accent)"
                    : "var(--border)";
              const background = isCorrect
                ? "color-mix(in srgb, var(--success, #10b981) 14%, transparent)"
                : isWrongPick
                  ? "color-mix(in srgb, var(--danger, #ef4444) 12%, transparent)"
                  : isPicked
                    ? "var(--accent-soft)"
                    : "var(--bg)";
              return (
                <button
                  key={o.key}
                  type="button"
                  disabled={answered || submitting}
                  onClick={() => setSelected(o.key)}
                  className="flex items-center justify-between gap-3 rounded-[1.2rem] border px-4 py-3 text-left text-sm font-semibold transition"
                  style={{ borderColor, background, cursor: answered ? "default" : "pointer" }}
                >
                  <span>{pick(o.label, locale)}</span>
                  {isCorrect && <span aria-hidden>✓</span>}
                  {isWrongPick && <span aria-hidden>✗</span>}
                </button>
              );
            })}
          </div>

          {answered ? (
            <p className="mt-5 text-sm font-semibold" style={{ color: data.answer?.isCorrect ? "var(--success, #10b981)" : "var(--danger, #ef4444)" }}>
              {data.answer?.isCorrect ? t("resultCorrect", { points: data.question.points }) : t("resultWrong")}
            </p>
          ) : (
            <button className="btn btn-accent mt-5" type="button" disabled={!selected || submitting} onClick={() => void submit()}>
              {submitting ? t("submitting") : t("submit")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stats({ stats, triviador, t }: { stats?: Stats; triviador?: Triviador; t: ReturnType<typeof useTranslations> }) {
  if (!stats) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        {t("statPoints", { points: stats.totalPoints })}
      </span>
      <span className="rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        🔥 {t("statStreak", { count: stats.currentStreak })}
      </span>
      {triviador?.earned && (
        <span className="rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
          🏅 {t("triviadorBadge")}
        </span>
      )}
    </div>
  );
}
