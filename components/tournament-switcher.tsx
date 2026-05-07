"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

type TournamentOption = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
};

export function TournamentSwitcher({
  currentTournamentId,
  tournaments,
}: {
  currentTournamentId?: string | null;
  tournaments: TournamentOption[];
}) {
  const t = useTranslations("tournamentSwitcher");
  const [selectedTournamentId, setSelectedTournamentId] = useState(currentTournamentId ?? tournaments[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectedTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? tournaments[0],
    [selectedTournamentId, tournaments],
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleChange(nextTournamentId: string) {
    setSelectedTournamentId(nextTournamentId);
    setOpen(false);
    startTransition(async () => {
      await fetch("/api/tournament/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: nextTournamentId }),
      });
      window.location.reload();
    });
  }

  if (tournaments.length === 0) {
    return (
      <div
        className="rounded-[1.4rem] border px-4 py-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("label")}</p>
        <p className="mt-2 text-sm font-bold">{t("noTournaments")}</p>
      </div>
    );
  }

  return (
    <div
      className="block min-w-0 rounded-[1.5rem] border px-4 py-4"
      ref={rootRef}
      style={{
        borderColor: "color-mix(in srgb, var(--accent) 24%, var(--border) 76%)",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 40%, var(--bg-strong) 60%), var(--bg-strong))",
        boxShadow: "inset 0 1px 0 color-mix(in srgb, white 6%, transparent 94%)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("label")}</p>
        <span
          className="rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em]"
          style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
        >
          {t("context")}
        </span>
      </div>

      <div className="relative mt-3">
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          className="relative flex w-full items-center justify-between gap-3 rounded-[1.2rem] border px-4 py-3 text-left text-sm font-bold outline-none transition"
          disabled={isPending}
          onClick={() => setOpen((current) => !current)}
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 32%, var(--border) 68%)",
            background: "color-mix(in srgb, var(--bg) 72%, var(--accent-soft) 28%)",
            color: "var(--text)",
            boxShadow: "inset 0 1px 0 color-mix(in srgb, white 7%, transparent 93%)",
          }}
          type="button"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[1.2rem]"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 88%, transparent 12%), transparent 55%)",
            }}
          />
          <span className="relative block min-w-0 flex-1 truncate">{selectedTournament?.name ?? t("selectTournament")}</span>
          <span
            aria-hidden="true"
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent-strong)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
              <path
                d="M7 10L12 15L17 10"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.2"
              />
            </svg>
          </span>
        </button>

        {open ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-50 rounded-[1.3rem] border p-2"
            style={{
              borderColor: "color-mix(in srgb, var(--accent) 24%, var(--border) 76%)",
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--bg-strong) 86%, var(--accent-soft) 14%), var(--bg))",
              boxShadow: "0 18px 40px rgba(0, 0, 0, 0.16)",
            }}
          >
            <div className="mb-2 px-2 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em] muted">
              {t("chooseTournament")}
            </div>
            <div className="grid gap-1" role="listbox">
              {tournaments.map((tournament) => {
                const active = tournament.id === selectedTournamentId;

                return (
                  <button
                    className="flex w-full items-center justify-between rounded-[1rem] px-3 py-3 text-left text-sm font-semibold transition"
                    key={tournament.id}
                    onClick={() => void handleChange(tournament.id)}
                    style={{
                      background: active ? "var(--accent-soft)" : "transparent",
                      color: active ? "var(--accent-strong)" : "var(--text)",
                    }}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{tournament.name}</p>
                      <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] muted">{tournament.slug}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs muted">{t("switchHint")}</p>
    </div>
  );
}
