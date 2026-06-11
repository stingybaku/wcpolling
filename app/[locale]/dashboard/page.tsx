import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";
import { getCurrentTournament, getCurrentUser } from "@/app/api/helpers";
import { NewsSyncButton } from "@/components/news-sync-button";
import { NewsImage } from "@/components/news-image";
import { CountUp } from "@/components/count-up";
import { computeStagedLeaderboard } from "@/lib/staged-leaderboard";
import { prisma } from "@/lib/prisma";

type ScoreType = "MATCH" | "GROUP_STANDING" | "KNOCKOUT" | "TIEBREAKER";

function summarizeScores(scores: Array<{ points: number; scoreType: ScoreType }>) {
  return scores.reduce(
    (acc, s) => {
      acc.total += s.points;
      acc[s.scoreType] += s.points;
      return acc;
    },
    { total: 0, MATCH: 0, GROUP_STANDING: 0, KNOCKOUT: 0, TIEBREAKER: 0 },
  );
}

function memberColor(userId: string): string {
  const palette = [
    "#10b981", "#f59e0b", "#a855f7", "#0ea5e9",
    "#ef4444", "#14b8a6", "#f97316", "#6366f1",
  ];
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (Math.imul(31, h) + userId.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function Avatar({ userId, name, size = 22 }: { userId: string; name: string; size?: number }) {
  const color = memberColor(userId);
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 700,
        fontFamily: "var(--font-mono)",
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  );
}

function LiveDot() {
  return <span className="live-dot" />;
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const user = await getCurrentUser();
  const currentTournament = await getCurrentTournament();
  // Staged tournaments use group-based stage predictions, not the standalone
  // "My Predictions" sheet — hide that entry point in staged context.
  const isStagedTournament = currentTournament?.type === "STAGED";

  if (!user) return null;

  // ── Data fetching ──────────────────────────────────────────────
  const [groups, todayMatches, submissionCount] = await Promise.all([
    prisma.groupRoom.findMany({
      where: {
        memberships: { some: { userId: user.id } },
        ...(currentTournament?.id ? { tournamentId: currentTournament.id } : {}),
      },
      include: {
        tournament: {
          select: {
            id: true,
            type: true,
            name: true,
            tags: { orderBy: { name: "asc" } },
            submissionDeadline: true,
          },
        },
        memberships: { select: { userId: true } },
        submissions: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            prediction: { select: { name: true } },
            scores: { select: { points: true, scoreType: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    currentTournament?.id
      ? prisma.match.findMany({
          where: {
            tournamentId: currentTournament.id,
            scheduledAt: {
              gte: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
              lt: new Date(new Date().toISOString().slice(0, 10) + "T23:59:59Z"),
            },
          },
          include: {
            homeTeam: { select: { name: true, fifaCode: true } },
            awayTeam: { select: { name: true, fifaCode: true } },
          },
          orderBy: { scheduledAt: "asc" },
          take: 6,
        })
      : Promise.resolve([]),
    prisma.predictionSubmission.count({
      where: {
        userId: user.id,
        ...(currentTournament?.id
          ? { group: { tournamentId: currentTournament.id } }
          : {}),
      },
    }),
  ]);

  // ── Group performance ──────────────────────────────────────────
  // Staged tournaments score through StageScore (not legacy submissions), so we
  // build their leaderboard via the shared helper; legacy tournaments keep using
  // submission scores.
  const groupPerformance = await Promise.all(groups.map(async (group) => {
    type PerfRow = { userId: string; userName: string; predictionName: string | null; points: number; rank: number };
    let leaderboard: PerfRow[];

    if (group.tournament?.type === "STAGED" && group.tournament.id) {
      const staged = await computeStagedLeaderboard(group.id, group.tournament.id);
      leaderboard = staged.map((e, i) => ({
        userId: e.userId,
        userName: e.userName ?? tCommon("unknown"),
        predictionName: null,
        points: e.totalPoints,
        rank: i + 1,
      }));
    } else {
      leaderboard = group.submissions
        .map((sub) => ({
          userId: sub.user.id,
          userName: sub.user.name ?? sub.user.email ?? tCommon("unknown"),
          predictionName: sub.prediction.name as string | null,
          points: summarizeScores(sub.scores as Array<{ points: number; scoreType: ScoreType }>).total,
        }))
        .sort((a, b) => b.points - a.points || a.userName.localeCompare(b.userName))
        .map((row, i) => ({ ...row, rank: i + 1 }));
    }

    const userIdx = leaderboard.findIndex((e) => e.userId === user.id);
    const userRow = userIdx >= 0 ? leaderboard[userIdx] : null;
    const leaderPoints = leaderboard[0]?.points ?? 0;

    const deadline = group.tournament?.submissionDeadline ?? null;
    const deadlineSoon =
      deadline && deadline > new Date() && deadline.getTime() - Date.now() < 6 * 60 * 60 * 1000;
    const deadlineHours = deadline
      ? Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 3600000))
      : null;
    const deadlineMins = deadline
      ? Math.max(0, Math.floor(((deadline.getTime() - Date.now()) % 3600000) / 60000))
      : null;

    return {
      id: group.id,
      name: group.name,
      tournamentName: group.tournament?.name ?? t("unassignedTournament"),
      memberCount: group.memberships.length,
      color: memberColor(group.id),
      rank: userRow?.rank ?? null,
      predictionName: userRow?.predictionName ?? null,
      points: userRow?.points ?? 0,
      leaderPoints,
      leaderboard,
      userIdx,
      alert:
        deadlineSoon && !userRow
          ? `Deadline in ${deadlineHours}h ${deadlineMins}m — no draft selected`
          : null,
    };
  }));

  // ── Aggregate KPIs ─────────────────────────────────────────────
  const rankedGroups = groupPerformance.filter((g) => g.rank !== null);
  const totalPoints = rankedGroups.reduce((sum, g) => sum + g.points, 0);
  const bestRankEntry = rankedGroups.reduce(
    (best, g) => (g.rank !== null && (best === null || g.rank < best.rank!) ? g : best),
    null as (typeof groupPerformance)[0] | null,
  );

  // ── Featured match (hero) ──────────────────────────────────────
  const heroMatch = todayMatches[0] ?? null;

  // ── News ────────────────────────────────────────────────────────
  const newsroomTags = currentTournament?.tags ?? ([] as Array<{ id: string; name: string }>);
  const newsArticles = await prisma.newsArticle.findMany({
    where: currentTournament?.id ? { tournamentId: currentTournament.id } : undefined,
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: 6,
  });

  return (
    <div className="-mx-4 -mt-5 md:-mx-6 lg:-mx-8">
      {/* Body grid */}
      <div
        className="grid gap-5 p-5 lg:p-6"
        style={{ gridTemplateColumns: "1fr", gridAutoRows: "auto" }}
      >
        <div className="xl:col-span-full grid gap-5 xl:grid-cols-[1.55fr_1fr]">
          {/* ── LEFT COLUMN ───────────────────────────────────────── */}
          <div className="flex flex-col gap-4 min-w-0">
            {/* Broadcast hero */}
            <div className="surface-broadcast" style={{ padding: "20px 24px", position: "relative", overflow: "hidden" }}>
              {heroMatch ? (
                <>
                  <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div className="row gap-2" style={{ alignItems: "center" }}>
                      <LiveDot />
                      <span className="text-xs mono" style={{ color: "#94a3b8", letterSpacing: "0.18em" }}>
                        {heroMatch.status === "FINISHED" ? t("lastResult") : t("upNext")}
                        {heroMatch.homeTeam && heroMatch.awayTeam
                          ? ` · ${heroMatch.homeTeam.fifaCode} vs ${heroMatch.awayTeam.fifaCode}`
                          : ""}
                      </span>
                    </div>
                    {heroMatch.status === "FINISHED" && (
                      <span className="text-xs mono" style={{ color: "#10b981", letterSpacing: "0.16em" }}>{t("fullTime")}</span>
                    )}
                    {heroMatch.status === "SCHEDULED" && heroMatch.scheduledAt && (
                      <span className="text-xs mono" style={{ color: "#94a3b8", letterSpacing: "0.16em" }}>
                        {new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(heroMatch.scheduledAt)}
                      </span>
                    )}
                  </div>

                  <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 24 }}>
                    <div className="col gap-1" style={{ flex: 1 }}>
                      <span className="display" style={{ fontSize: 22, color: "#fff" }}>
                        {heroMatch.homeTeam?.name ?? heroMatch.homePlaceholder ?? "TBD"}
                      </span>
                      <span className="text-xs mono" style={{ color: "#64748b", letterSpacing: "0.12em" }}>
                        {heroMatch.homeTeam?.fifaCode ?? "—"}
                      </span>
                    </div>

                    <div className="col" style={{ alignItems: "center", gap: 4 }}>
                      {heroMatch.status === "FINISHED" ? (
                        <div className="row gap-2" style={{ alignItems: "baseline" }}>
                          <span className="display tabnum" style={{ fontSize: 56, color: "#fff", lineHeight: 1 }}>
                            {heroMatch.homeScore ?? 0}
                          </span>
                          <span style={{ fontSize: 24, color: "#334155" }}>—</span>
                          <span className="display tabnum" style={{ fontSize: 56, color: "#fff", lineHeight: 1 }}>
                            {heroMatch.awayScore ?? 0}
                          </span>
                        </div>
                      ) : (
                        <div className="row gap-2" style={{ alignItems: "baseline" }}>
                          <span className="display tabnum" style={{ fontSize: 56, color: "#334155", lineHeight: 1 }}>–</span>
                          <span style={{ fontSize: 24, color: "#334155" }}>vs</span>
                          <span className="display tabnum" style={{ fontSize: 56, color: "#334155", lineHeight: 1 }}>–</span>
                        </div>
                      )}
                    </div>

                    <div className="col gap-1" style={{ flex: 1, alignItems: "flex-end" }}>
                      <span className="display" style={{ fontSize: 22, color: "#fff", textAlign: "right" }}>
                        {heroMatch.awayTeam?.name ?? heroMatch.awayPlaceholder ?? "TBD"}
                      </span>
                      <span className="text-xs mono" style={{ color: "#64748b", letterSpacing: "0.12em" }}>
                        {heroMatch.awayTeam?.fifaCode ?? "—"}
                      </span>
                    </div>
                  </div>

                  <div className="row gap-3" style={{ alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: "1px solid #1c2434" }}>
                    {!isStagedTournament && (
                      <Link
                        href="/dashboard/predictions"
                        className="btn btn-sm"
                        style={{ background: "transparent", borderColor: "#334155", color: "#fff" }}
                      >
                        {t("myPredictionsLink")}
                      </Link>
                    )}
                    <Link
                      href="/dashboard/groups"
                      className="btn btn-sm"
                      style={{ background: "transparent", borderColor: "#334155", color: "#94a3b8" }}
                    >
                      {t("groupsLink")}
                    </Link>
                  </div>
                </>
              ) : (
                <div className="col gap-2" style={{ padding: "12px 0" }}>
                  <span className="text-xs mono" style={{ color: "#64748b", letterSpacing: "0.18em" }}>
                    {currentTournament ? t("noMatchesScheduled") : t("noActiveTournament")}
                  </span>
                  <span className="display" style={{ fontSize: 26, color: "#fff" }}>
                    {currentTournament?.name ?? "World Cup 2026"}
                  </span>
                  <div className="row gap-3" style={{ marginTop: 8 }}>
                    {!isStagedTournament && (
                      <Link href="/dashboard/predictions" className="btn btn-sm" style={{ background: "transparent", borderColor: "#334155", color: "#fff" }}>
                        {t("myPredictionsLink")}
                      </Link>
                    )}
                    <Link href="/dashboard/groups" className="btn btn-sm" style={{ background: "transparent", borderColor: "#334155", color: "#94a3b8" }}>
                      {t("groupsLink")}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="surface" style={{ padding: "14px 16px" }}>
                <span className="eyebrow">{t("liveTotalLabel")}</span>
                <div className="row gap-2" style={{ alignItems: "baseline", marginTop: 6 }}>
                  <span className="display tabnum text-3xl">
                    <CountUp value={totalPoints} />
                  </span>
                </div>
                <span className="text-xs muted">
                  {t("acrossGroups", { count: groupPerformance.length })}
                </span>
              </div>
              <div className="surface" style={{ padding: "14px 16px" }}>
                <span className="eyebrow">{t("bestRank")}</span>
                <div className="row gap-2" style={{ alignItems: "baseline", marginTop: 6 }}>
                  <span className="display tabnum text-3xl">
                    {bestRankEntry ? `#${bestRankEntry.rank}` : "—"}
                  </span>
                </div>
                <span className="text-xs muted">
                  {bestRankEntry ? bestRankEntry.name : t("noGroupsYet")}
                </span>
              </div>
              <div className="surface" style={{ padding: "14px 16px" }}>
                <span className="eyebrow">{t("joinedGroups")}</span>
                <div className="row gap-2" style={{ alignItems: "baseline", marginTop: 6 }}>
                  <span className="display tabnum text-3xl">{groupPerformance.length}</span>
                </div>
                <span className="text-xs muted">
                  {submissionCount} submission{submissionCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="surface" style={{ padding: "14px 16px" }}>
                <span className="eyebrow">{t("pointsLead")}</span>
                <div className="row gap-2" style={{ alignItems: "baseline", marginTop: 6 }}>
                  <span
                    className="display tabnum text-3xl"
                    style={{
                      color: bestRankEntry && bestRankEntry.rank === 1
                        ? "var(--accent-strong)"
                        : bestRankEntry
                        ? "var(--live)"
                        : undefined,
                    }}
                  >
                    {bestRankEntry
                      ? bestRankEntry.rank === 1
                        ? `+${bestRankEntry.points - (bestRankEntry.leaderboard[1]?.points ?? 0)}`
                        : `−${bestRankEntry.leaderPoints - bestRankEntry.points}`
                      : "—"}
                  </span>
                </div>
                <span className="text-xs muted">
                  {bestRankEntry
                    ? bestRankEntry.rank === 1
                      ? t("aheadOf2")
                      : t("gapTo1", { group: bestRankEntry.name })
                    : t("noRankedGroups")}
                </span>
              </div>
            </div>

            {/* Groups grid */}
            <div className="flex flex-col gap-3">
              <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
                <h3 className="display text-xl" style={{ margin: 0 }}>{t("yourGroups")}</h3>
                <Link href="/dashboard/groups" className="btn btn-sm btn-ghost">
                  {t("allGroups")}
                </Link>
              </div>

              {groupPerformance.length === 0 ? (
                <div className="surface" style={{ padding: 20 }}>
                  <p className="bold">{t("noGroupPerformance")}</p>
                  <p className="text-sm muted" style={{ marginTop: 6 }}>{t("noGroupPerformanceDesc")}</p>
                  <Link href="/dashboard/groups" className="btn btn-sm" style={{ marginTop: 12, display: "inline-flex" }}>
                    {t("joinOrCreate")}
                  </Link>
                </div>
              ) : (
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
                >
                  {groupPerformance.map((g) => {
                    // Build display rows: top 2 + user if not in top 2
                    const top2 = g.leaderboard.slice(0, 2);
                    const userInTop2 = g.userIdx >= 0 && g.userIdx < 2;
                    const showDots = g.userIdx >= 2;
                    const userRow = g.userIdx >= 0 ? g.leaderboard[g.userIdx] : null;

                    return (
                      <Link
                        key={g.id}
                        href={`/dashboard/groups/${g.id}`}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <div
                          className="surface"
                          style={{
                            position: "relative",
                            borderLeft: `3px solid ${g.color}`,
                            display: "flex",
                            flexDirection: "column",
                            transition: "box-shadow 0.15s",
                            cursor: "pointer",
                          }}
                        >
                          {/* Group header */}
                          <div
                            className="row"
                            style={{
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "12px 14px 8px",
                            }}
                          >
                            <div className="col" style={{ minWidth: 0 }}>
                              <span
                                className="bold text-md"
                                style={{ lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              >
                                {g.name}
                              </span>
                              <span className="text-xs muted mono" style={{ letterSpacing: "0.12em" }}>
                                {t("members", { count: g.memberCount })}
                              </span>
                            </div>
                            <div className="col" style={{ alignItems: "flex-end", flexShrink: 0 }}>
                              <span className="text-xs muted mono">{t("rank").toUpperCase()}</span>
                              <span className="display tabnum text-xl">
                                {g.rank ? `#${g.rank}` : "—"}
                              </span>
                            </div>
                          </div>

                          {/* Mini leaderboard */}
                          <div style={{ padding: "0 10px 10px" }}>
                            {top2.map((row) => (
                              <div
                                key={row.userId}
                                className="row gap-2"
                                style={{
                                  alignItems: "center",
                                  padding: "4px 6px",
                                  background: row.userId === user.id ? "var(--accent-soft)" : "transparent",
                                  borderRadius: 5,
                                }}
                              >
                                <span className="mono muted" style={{ width: 18, fontSize: 10 }}>
                                  #{row.rank}
                                </span>
                                <Avatar userId={row.userId} name={row.userName} size={18} />
                                <span className="bold text-xs" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {row.userId === user.id ? t("youLabel") : row.userName}
                                </span>
                                <span className="mono extrabold tabnum text-sm">{row.points}</span>
                              </div>
                            ))}

                            {showDots && (
                              <>
                                <div
                                  className="text-xs mono muted"
                                  style={{ textAlign: "center", padding: "2px 0" }}
                                >
                                  · · ·
                                </div>
                                {userRow && (
                                  <div
                                    className="row gap-2"
                                    style={{
                                      alignItems: "center",
                                      padding: "4px 6px",
                                      background: "var(--accent-soft)",
                                      borderRadius: 5,
                                    }}
                                  >
                                    <span className="mono muted" style={{ width: 18, fontSize: 10 }}>
                                      #{userRow.rank}
                                    </span>
                                    <Avatar userId={user.id} name={user.name ?? user.email ?? "You"} size={18} />
                                    <span className="bold text-xs" style={{ flex: 1 }}>You</span>
                                    <span className="mono extrabold tabnum text-sm">{userRow.points}</span>
                                  </div>
                                )}
                              </>
                            )}

                            {!userInTop2 && !showDots && !userRow && (
                              <div
                                className="text-xs muted"
                                style={{ padding: "4px 6px", fontStyle: "italic" }}
                              >
                                {t("noPrediction")}
                              </div>
                            )}
                          </div>

                          {/* Alert banner */}
                          {g.alert && (
                            <div
                              className="row gap-2"
                              style={{
                                alignItems: "center",
                                padding: "6px 12px",
                                background: "var(--gold-soft)",
                                borderTop: "1px solid var(--gold)",
                                color: "#7a4a00",
                              }}
                            >
                              <span className="text-xs">⚠</span>
                              <span className="text-xs bold">{g.alert}</span>
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN ──────────────────────────────────────── */}
          <div className="flex flex-col gap-4 min-w-0">
            {/* Today's matches */}
            <div className="surface" style={{ padding: "16px 18px" }}>
              <div
                className="row"
                style={{ alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}
              >
                <h3 className="display text-lg" style={{ margin: 0 }}>{t("today")}</h3>
                <span className="text-xs muted mono">{t("matchCount", { count: todayMatches.length })}</span>
              </div>

              {todayMatches.length === 0 ? (
                <p className="text-xs muted" style={{ padding: "4px 0" }}>
                  {t("noMatchesToday")}
                </p>
              ) : (
                <div className="col gap-1">
                  {todayMatches.map((m, i) => (
                    <div
                      key={m.id}
                      className="row gap-2"
                      style={{
                        alignItems: "center",
                        padding: "8px 4px",
                        borderBottom: i === todayMatches.length - 1 ? 0 : "1px solid var(--border)",
                      }}
                    >
                      <div style={{ width: 44, flexShrink: 0 }}>
                        {m.status === "FINISHED" ? (
                          <span className="chip chip-outline" style={{ fontSize: 9 }}>{t("ftLabel")}</span>
                        ) : (
                          <span className="text-xs mono muted">
                            {m.scheduledAt
                              ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(m.scheduledAt)
                              : "TBD"}
                          </span>
                        )}
                      </div>
                      <span
                        className="text-xs bold tabnum"
                        style={{ width: 32, textAlign: "right" }}
                      >
                        {m.homeTeam?.fifaCode ?? "—"}
                      </span>
                      <span
                        className="mono extrabold text-md tabnum"
                        style={{ minWidth: 48, textAlign: "center" }}
                      >
                        {m.status === "FINISHED"
                          ? `${m.homeScore ?? 0} – ${m.awayScore ?? 0}`
                          : "– –"}
                      </span>
                      <span className="text-xs bold tabnum" style={{ width: 32 }}>
                        {m.awayTeam?.fifaCode ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Newsroom */}
            <div className="surface" style={{ padding: "16px 18px", flex: 1 }}>
              <div
                className="row"
                style={{ alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}
              >
                <h3 className="display text-md" style={{ margin: 0 }}>{t("newsroom")}</h3>
                {newsroomTags.length > 0 && (
                  <div className="row gap-1" style={{ flexWrap: "wrap" }}>
                    {newsroomTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag.id}
                        className="chip chip-accent"
                        style={{ fontSize: 9, padding: "2px 7px" }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {newsArticles.length === 0 ? (
                <div>
                  <p className="text-xs bold">{t("feedEmptyTitle")}</p>
                  <p className="text-xs muted" style={{ marginTop: 4 }}>{t("feedEmptyDesc")}</p>
                </div>
              ) : (
                <div className="col gap-3" style={{ overflow: "auto", maxHeight: 420 }}>
                  {newsArticles.map((article) => (
                    <a
                      key={article.id}
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          padding: "10px 0",
                          borderBottom: "1px dashed var(--border)",
                        }}
                      >
                        {article.imageUrl && <NewsImage src={article.imageUrl} size={56} />}
                        <div style={{ minWidth: 0 }}>
                          <span
                            className="text-xs mono muted"
                            style={{ fontSize: 10, letterSpacing: "0.1em" }}
                          >
                            {article.sourceName ?? article.provider} ·{" "}
                            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(article.publishedAt)}
                          </span>
                          <p className="bold text-sm" style={{ marginTop: 3, lineHeight: 1.35 }}>
                            {article.title}
                          </p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {user.role === "ADMIN" && (
                <div style={{ marginTop: 12 }}>
                  <NewsSyncButton tournamentId={currentTournament?.id} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
