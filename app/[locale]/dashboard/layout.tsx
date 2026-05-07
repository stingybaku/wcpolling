import { ReactNode } from "react";
import { randomInt } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardNav } from "@/components/dashboard-nav";
import { UserMenu } from "@/components/user-menu";
import { getCurrentTournament, listTournaments } from "@/app/api/helpers";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const user = session.user;
  const t = await getTranslations("dashboard");

  const [currentTournament, tournaments] = await Promise.all([
    getCurrentTournament(),
    listTournaments(),
  ]);

  const tipKeys = ["0", "1", "2", "3", "4"] as const;
  const tTips = await getTranslations("tips");
  const tipIndex = randomInt(tipKeys.length);
  const dailyTip = tTips(tipKeys[tipIndex]);

  return (
    <div className="page-shell lg:flex">
      <DashboardNav currentTournamentId={currentTournament?.id} dailyTip={dailyTip} tournaments={tournaments} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b px-4 py-4 backdrop-blur lg:px-8" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 74%, transparent 26%)" }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="display-title text-3xl leading-none md:text-4xl">{t("layoutTitle")}</h1>
            </div>
            <div className="flex items-center gap-3">
              <UserMenu
                currentTournamentId={currentTournament?.id}
                email={user.email}
                image={user.image}
                name={user.name}
                role={user.role}
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
