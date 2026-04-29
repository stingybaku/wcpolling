import { ReactNode } from "react";
import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardNav } from "@/components/dashboard-nav";
import { UserMenu } from "@/components/user-menu";
import { getCurrentTournament, listTournaments } from "@/app/api/helpers";
import { dashboardTips } from "@/lib/dashboard-tips";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const [currentTournament, tournaments] = await Promise.all([
    getCurrentTournament(),
    listTournaments(),
  ]);
  const dailyTip = dashboardTips[randomInt(dashboardTips.length)] ?? dashboardTips[0];

  return (
    <div className="page-shell lg:flex">
      <DashboardNav currentTournamentId={currentTournament?.id} dailyTip={dailyTip} tournaments={tournaments} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b px-4 py-4 backdrop-blur lg:px-8" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 74%, transparent 26%)" }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="display-title text-3xl leading-none md:text-4xl">Matchday Dashboard</h1>
            </div>
            <div className="flex items-center gap-3">
              <UserMenu
                currentTournamentId={currentTournament?.id}
                email={session.user.email}
                image={session.user.image}
                name={session.user.name}
                role={session.user.role}
                tournaments={tournaments}
              />
            </div>
          </div>
        </header>
        <main className="px-4 pb-28 pt-5 md:px-6 lg:min-h-[calc(100vh-89px)] lg:px-8 lg:pb-8">{children}</main>
      </div>
    </div>
  );
}
