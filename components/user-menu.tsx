"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { TournamentSwitcher } from "@/components/tournament-switcher";
import { Link } from "@/lib/navigation";

type TournamentOption = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
};

function initialsFromIdentity(email?: string | null, name?: string | null) {
  if (name?.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  if (!email) return "U";
  return email.slice(0, 2).toUpperCase();
}

export function UserMenu({
  email,
  name,
  role,
  image,
  currentTournamentId,
  tournaments,
}: {
  email?: string | null;
  name?: string | null;
  role?: string;
  image?: string | null;
  currentTournamentId?: string | null;
  tournaments: TournamentOption[];
}) {
  const t = useTranslations("userMenu");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="surface flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full p-0 text-left sm:h-auto sm:w-auto sm:justify-start sm:gap-3 sm:rounded-[1.4rem] sm:px-3 sm:py-2"
        onClick={() => setOpen((current) => !current)}
        style={{ minWidth: "0" }}
        type="button"
      >
        {image ? (
          <img
            alt={name ?? email ?? "User avatar"}
            className="h-11 w-11 rounded-full object-cover"
            src={image}
          />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-extrabold text-white"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
          >
            {initialsFromIdentity(email, name)}
          </div>
        )}
        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="truncate text-sm font-bold">{name ?? email ?? "Unknown user"}</p>
          <p className="truncate text-xs muted">{email ?? ""}</p>
          <p className="text-xs uppercase tracking-[0.2em] muted">{role ?? "USER"}</p>
        </div>
        <span className="hidden text-xs font-semibold uppercase tracking-[0.22em] muted sm:block">{t("menu")}</span>
      </button>

      {open ? (
        <div className="surface absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(18rem,calc(100vw-1.5rem))] rounded-[1.4rem] p-3 sm:w-[20rem] sm:rounded-[1.6rem]">
          <div className="rounded-[1.2rem] border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] muted">{t("account")}</p>
            <p className="mt-2 truncate text-sm font-bold">{name ?? email ?? "Unknown user"}</p>
            <p className="mt-1 truncate text-xs muted">{email ?? ""}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] muted">{t("role", { role: role ?? "USER" })}</p>
          </div>

          <div className="mt-3 grid gap-2">
            <div className="lg:hidden">
              <TournamentSwitcher currentTournamentId={currentTournamentId} tournaments={tournaments} />
            </div>
            {role === "ADMIN" ? (
              <Link className="rounded-[1.2rem] border px-4 py-3 text-sm font-semibold transition hover:opacity-90" href="/dashboard/admin" onClick={() => setOpen(false)} style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                {t("adminDashboard")}
              </Link>
            ) : null}
            <Link className="rounded-[1.2rem] border px-4 py-3 text-sm font-semibold transition hover:opacity-90" href="/dashboard/profile" onClick={() => setOpen(false)} style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
              {t("viewProfile")}
            </Link>
            <LocaleSwitcher className="flex w-full items-center justify-center rounded-[1.2rem] border px-4 py-3 text-sm font-semibold transition hover:opacity-90" />
            <ThemeToggle className="flex w-full items-center justify-center rounded-[1.2rem] border px-4 py-3 text-sm font-semibold transition hover:opacity-90" />
            <button
              className="w-full rounded-[1.2rem] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              onClick={() => {
                setOpen(false);
                signOut({ callbackUrl: "/" });
              }}
              style={{ background: "linear-gradient(135deg, var(--danger), #d48a3a)" }}
              type="button"
            >
              {t("signOut")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
