"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TeamFlag } from "@/components/team-flag";

type Team = { id: string; name: string; fifaCode: string };
type Round = "GROUP" | "R32" | "R16" | "QF" | "SF" | "FINAL";
type Match = {
  id: string;
  round: Round;
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

const ROUND_ORDER: Round[] = ["GROUP", "R32", "R16", "QF", "SF", "FINAL"];

export default function MatchCenterPage() {
  const t = useTranslations("matchCenter");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const tRes = await fetch("/api/tournament");
      if (!tRes.ok) { setLoading(false); return; }
      const { tournament } = await tRes.json();
      if (!tournament?.id) { setLoading(false); return; }
      const res = await fetch(`/api/staged/tournaments/${tournament.id}/match-results`);
      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches ?? []);
      }
      setLoading(false);
    }
    void load();
  }, []);

  const byRound = ROUND_ORDER.map((round) => ({
    round,
    matches: matches.filter((m) => m.round === round),
  })).filter((r) => r.matches.length > 0);

  const cards = (yellow: number, red: number) => (
    <span className="shrink-0 whitespace-nowrap text-[10px]" style={{ color: "var(--muted)" }}>
      {yellow > 0 && <span>🟨{yellow} </span>}
      {red > 0 && <span>🟥{red}</span>}
    </span>
  );

  const groupNames = Array.from(
    new Set(matches.filter((m) => m.round === "GROUP" && m.groupName).map((m) => m.groupName as string)),
  ).sort();

  const teamLine = (team: Team, cardsEl: ReactNode, played: boolean, score: number | null) => (
    <div className="flex items-center gap-2">
      <span className="shrink-0"><TeamFlag code={team.fifaCode} size={18} /></span>
      <span className="truncate min-w-0 flex-1 text-sm font-medium" style={{ color: "var(--ink)" }}>{team.name}</span>
      {cardsEl}
      <span className="shrink-0 text-right text-sm font-extrabold" style={{ minWidth: 18, color: "var(--ink)" }}>
        {played ? score ?? 0 : "–"}
      </span>
    </div>
  );

  const matchRow = (m: Match) => {
    const played = m.status === "FINISHED";
    return (
      <div key={m.id} className="rounded-xl px-3 py-2 space-y-1" style={{ background: "var(--bg-strong)" }}>
        {teamLine(m.homeTeam, cards(m.homeYellow, m.homeRed), played, m.homeScore)}
        {teamLine(m.awayTeam, cards(m.awayYellow, m.awayRed), played, m.awayScore)}
        {!played && <p className="text-right text-[10px] uppercase tracking-wide muted">{t("scheduled")}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>{t("tagline")}</p>
        <h2 className="display-title mt-3 text-4xl leading-none md:text-6xl">{t("title")}</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 muted">{t("subtitle")}</p>
      </section>

      {loading ? (
        <p className="muted text-sm">{t("loading")}</p>
      ) : matches.length === 0 ? (
        <p className="muted text-sm">{t("empty")}</p>
      ) : (
        byRound.map(({ round, matches: rms }) =>
          round === "GROUP" ? (
            <section key={round} className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest muted">{t("rounds.GROUP")}</p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {groupNames.map((g) => (
                  <div key={g} className="surface rounded-[1.6rem] p-4">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent-strong)" }}>{t("group", { name: g })}</p>
                    <div className="mt-3 space-y-2">
                      {rms.filter((m) => m.groupName === g).map(matchRow)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section key={round} className="surface rounded-[2rem] p-5 md:p-6">
              <p className="text-xs font-bold uppercase tracking-widest muted mb-3">{t(`rounds.${round}`)}</p>
              <div className="space-y-2">{rms.map(matchRow)}</div>
            </section>
          ),
        )
      )}
    </div>
  );
}
