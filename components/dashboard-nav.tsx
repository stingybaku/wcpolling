"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TournamentSwitcher } from "@/components/tournament-switcher";

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/groups", label: "Groups" },
  { href: "/dashboard/predictions", label: "Predictions" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

type TournamentOption = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
};

export function DashboardNav({
  currentTournamentId,
  dailyTip,
  tournaments,
}: {
  currentTournamentId?: string | null;
  dailyTip: string;
  tournaments: TournamentOption[];
}) {
  const pathname = usePathname();

  return (
    <>
      <aside className="surface sticky top-0 hidden h-screen w-[300px] flex-col justify-between overflow-hidden rounded-none border-y-0 border-l-0 px-6 py-8 lg:flex">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl border text-sm font-extrabold uppercase tracking-[0.24em]"
                style={{ borderColor: "var(--border)", background: "var(--bg-strong)", color: "var(--accent-strong)" }}
              >
                LP
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Logo</p>
                <p className="text-sm font-bold">Placeholder mark</p>
              </div>
            </div>

            <div className="inline-flex rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.32em]" style={{ borderColor: "var(--border)", background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
              Control Room
            </div>
            <div>
              <p className="muted mt-2 text-sm">League and Tournament predictions, group rivalry, and live scoring in one control room.</p>
            </div>
          </div>

          <div className="space-y-6">
            <TournamentSwitcher currentTournamentId={currentTournamentId} tournaments={tournaments} />
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);

              return (
                <Link
                  className="block rounded-2xl border px-4 py-3 text-sm font-semibold transition"
                  href={item.href}
                  key={item.href}
                  style={{
                    borderColor: active ? "color-mix(in srgb, var(--accent) 45%, var(--border) 55%)" : "var(--border)",
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent-strong)" : "var(--text)",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="rounded-[1.4rem] border px-4 py-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] muted">Tip of the Day</p>
          <p className="mt-3 text-sm muted">{dailyTip}</p>
        </div>
      </aside>

      <nav className="surface fixed inset-x-3 bottom-3 z-40 rounded-[1.6rem] px-2 py-2 lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                className="flex min-h-[3.25rem] items-center justify-center rounded-2xl px-2 py-3 text-center text-[0.7rem] font-semibold uppercase tracking-[0.18em]"
                href={item.href}
                key={item.href}
                style={{
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent-strong)" : "var(--text-muted)",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
