/* eslint-disable @next/next/no-img-element */

import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/navigation";
import { getCurrentTournament, getCurrentUser } from "@/app/api/helpers";
import { NewsSyncButton } from "@/components/news-sync-button";
import { prisma } from "@/lib/prisma";

type ScoreType = "MATCH" | "GROUP_STANDING" | "KNOCKOUT" | "TIEBREAKER";

type NewsFeedItem =
  | ({ kind: "article" } & Awaited<ReturnType<typeof prisma.newsArticle.findMany>>[number])
  | {
      kind: "sponsored";
      id: string;
      title: string;
      summary: string | null;
      imageUrl: string | null;
      targetUrl: string;
      ctaLabel: string | null;
      sponsorName: string | null;
      badgeLabel: string;
    };

function summarizeScores(scores: Array<{ points: number; scoreType: ScoreType }>) {
  return scores.reduce(
    (accumulator, score) => {
      accumulator.total += score.points;
      accumulator[score.scoreType] += score.points;
      return accumulator;
    },
    {
      total: 0,
      MATCH: 0,
      GROUP_STANDING: 0,
      KNOCKOUT: 0,
      TIEBREAKER: 0,
    },
  );
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const user = await getCurrentUser();
  const currentTournament = await getCurrentTournament();

  if (!user) {
    return null;
  }

  const groups = await prisma.groupRoom.findMany({
    where: {
      memberships: { some: { userId: user.id } },
      ...(currentTournament?.id ? { tournamentId: currentTournament.id } : {}),
    },
    include: {
      tournament: {
        include: {
          tags: {
            orderBy: { name: "asc" },
          },
        },
      },
      memberships: {
        select: { userId: true },
      },
      submissions: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          prediction: {
            select: { name: true },
          },
          scores: {
            select: { points: true, scoreType: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const groupPerformance = groups.map((group) => {
    const leaderboard = group.submissions
      .map((submission) => {
        const scoreSummary = summarizeScores(submission.scores as Array<{ points: number; scoreType: ScoreType }>);
        return {
          userId: submission.user.id,
          userName: submission.user.name ?? submission.user.email ?? tCommon("unknown"),
          predictionName: submission.prediction.name,
          points: scoreSummary.total,
          breakdown: scoreSummary,
        };
      })
      .sort((a, b) => b.points - a.points || a.userName.localeCompare(b.userName));

    const userRow = leaderboard.find((entry) => entry.userId === user.id) ?? null;

    return {
      id: group.id,
      name: group.name,
      tournamentName: group.tournament?.name ?? t("unassignedTournament"),
      memberCount: group.memberships.length,
      submissionCount: group.submissions.length,
      rank: userRow ? leaderboard.findIndex((entry) => entry.userId === user.id) + 1 : null,
      predictionName: userRow?.predictionName ?? null,
      points: userRow?.points ?? 0,
      breakdown: userRow?.breakdown ?? { total: 0, MATCH: 0, GROUP_STANDING: 0, KNOCKOUT: 0, TIEBREAKER: 0 },
    };
  });

  const rankedGroups = groupPerformance.filter((group) => group.rank !== null);
  const totalPoints = rankedGroups.reduce((sum, group) => sum + group.points, 0);
  const bestRank = rankedGroups.reduce((best, group) => {
    if (group.rank === null) return best;
    if (best === null) return group.rank;
    return Math.min(best, group.rank);
  }, null as number | null);

  const newsroomTags = currentTournament?.tags ?? [];
  const newsArticles = await prisma.newsArticle.findMany({
    where: currentTournament?.id ? { tournamentId: currentTournament.id } : undefined,
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: 12,
  });
  const now = new Date();
  const sponsoredPlacements = currentTournament?.id
    ? await prisma.sponsoredPlacement.findMany({
        where: {
          tournamentId: currentTournament.id,
          isActive: true,
          OR: [
            { activeFrom: null, activeTo: null },
            { activeFrom: null, activeTo: { gte: now } },
            { activeFrom: { lte: now }, activeTo: null },
            { activeFrom: { lte: now }, activeTo: { gte: now } },
          ],
        },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: 4,
      })
    : [];

  const newsFeed: NewsFeedItem[] = [];
  const adEvery = 4;
  let sponsoredIndex = 0;

  newsArticles.forEach((article, index) => {
    newsFeed.push({ kind: "article", ...article });
    if ((index + 1) % adEvery === 0 && sponsoredIndex < sponsoredPlacements.length) {
      const placement = sponsoredPlacements[sponsoredIndex++];
      newsFeed.push({
        kind: "sponsored",
        id: placement.id,
        title: placement.title,
        summary: placement.summary,
        imageUrl: placement.imageUrl,
        targetUrl: placement.targetUrl,
        ctaLabel: placement.ctaLabel,
        sponsorName: placement.sponsorName,
        badgeLabel: placement.badgeLabel,
      });
    }
  });

  while (sponsoredIndex < sponsoredPlacements.length && newsFeed.length < 12) {
    const placement = sponsoredPlacements[sponsoredIndex++];
    newsFeed.push({
      kind: "sponsored",
      id: placement.id,
      title: placement.title,
      summary: placement.summary,
      imageUrl: placement.imageUrl,
      targetUrl: placement.targetUrl,
      ctaLabel: placement.ctaLabel,
      sponsorName: placement.sponsorName,
      badgeLabel: placement.badgeLabel,
    });
  }

  return (
    <div className="space-y-6">
      <section className="hero-surface rounded-[2rem] border px-5 py-5 md:px-8 md:py-6" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>{t("tagline")}</p>
        <h2 className="display-title mt-2 text-4xl leading-none md:text-6xl xl:text-[4.6rem]">{t("title")}</h2>
        <p className="mt-3 text-sm leading-6 muted md:text-base">{t("subtitle")}</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="surface rounded-[2rem] p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("performance")}</p>
                <h3 className="mt-2 text-3xl font-extrabold">{t("performanceTitle")}</h3>
              </div>
              <Link className="rounded-[1.2rem] border px-4 py-3 text-sm font-semibold transition hover:opacity-90" href="/dashboard/groups" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                {t("openGroups")}
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("joinedGroups")}</p>
                <p className="mt-2 text-3xl font-extrabold">{groupPerformance.length}</p>
              </div>
              <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("bestRank")}</p>
                <p className="mt-2 text-3xl font-extrabold">{bestRank ? `#${bestRank}` : "-"}</p>
              </div>
              <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("totalPoints")}</p>
                <p className="mt-2 text-3xl font-extrabold">{totalPoints}</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {groupPerformance.length > 0 ? groupPerformance.map((group) => (
                <article key={group.id} className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-lg font-bold">{group.name}</p>
                      <p className="mt-1 text-sm muted">{group.tournamentName}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] muted">
                        {t("members", { count: group.memberCount })} • {t("submissions", { count: group.submissionCount })}
                      </p>
                      <p className="mt-2 text-sm muted">
                        {group.predictionName ? t("livePick", { name: group.predictionName }) : t("noPrediction")}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded-[1.2rem] px-4 py-3 text-center" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em]">{t("rank")}</p>
                        <p className="mt-1 text-2xl font-extrabold">{group.rank ? `#${group.rank}` : "-"}</p>
                      </div>
                      <div className="rounded-[1.2rem] border px-4 py-3 text-center" style={{ borderColor: "var(--border)" }}>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] muted">{t("points")}</p>
                        <p className="mt-1 text-2xl font-extrabold">{group.points}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs md:grid-cols-4">
                    <div className="rounded-full px-3 py-2" style={{ background: "var(--bg)" }}>{t("matches", { count: group.breakdown.MATCH })}</div>
                    <div className="rounded-full px-3 py-2" style={{ background: "var(--bg)" }}>{t("standings", { count: group.breakdown.GROUP_STANDING })}</div>
                    <div className="rounded-full px-3 py-2" style={{ background: "var(--bg)" }}>{t("bracket", { count: group.breakdown.KNOCKOUT })}</div>
                    <div className="rounded-full px-3 py-2" style={{ background: "var(--bg)" }}>{t("tieBreakers", { count: group.breakdown.TIEBREAKER })}</div>
                  </div>

                  <div className="mt-4">
                    <Link className="text-sm font-semibold" href={`/dashboard/groups/${group.id}`} style={{ color: "var(--accent-strong)" }}>
                      {t("openGroupRoom")}
                    </Link>
                  </div>
                </article>
              )) : (
                <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                  <p className="text-lg font-bold">{t("noGroupPerformance")}</p>
                  <p className="mt-2 text-sm muted">{t("noGroupPerformanceDesc")}</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="surface rounded-[2rem] p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("newsroom")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {newsroomTags.length > 0 ? newsroomTags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                >
                  {tag.name}
                </span>
              )) : (
                <span className="rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: "var(--bg-strong)", color: "var(--text-muted)" }}>
                  {t("noTagsYet")}
                </span>
              )}
            </div>

            <div className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {newsFeed.length > 0 ? newsFeed.map((item) => (
                <article key={item.id} className="rounded-[1.4rem] border p-4" style={{ borderColor: item.kind === "sponsored" ? "color-mix(in srgb, var(--accent) 45%, var(--border) 55%)" : "var(--border)", background: "var(--bg-strong)" }}>
                  <div className="flex gap-4">
                    {item.imageUrl ? (
                      <img
                        alt={item.title}
                        className="hidden h-24 w-24 shrink-0 rounded-[1rem] object-cover sm:block"
                        src={item.imageUrl}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">
                            {item.kind === "sponsored" ? `${item.badgeLabel}${item.sponsorName ? ` • ${item.sponsorName}` : ""}` : item.sourceName ?? item.provider}
                          </p>
                          <p className="mt-2 text-lg font-bold">{item.title}</p>
                        </div>
                        {item.kind === "article" ? (
                          <span className="shrink-0 text-xs muted">
                            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(item.publishedAt)}
                          </span>
                        ) : null}
                      </div>
                      {item.imageUrl ? (
                        <img
                          alt={item.title}
                          className="mt-3 h-40 w-full rounded-[1rem] object-cover sm:hidden"
                          src={item.imageUrl}
                        />
                      ) : null}
                      {item.summary ? <p className="mt-3 text-sm muted">{item.summary}</p> : null}
                      {item.kind === "article" && item.matchedTags ? <p className="mt-3 text-xs muted">{t("matchedTags", { tags: item.matchedTags })}</p> : null}
                      <div className="mt-4">
                        <a className="text-sm font-semibold" href={item.kind === "sponsored" ? item.targetUrl : item.url} rel="noreferrer" style={{ color: "var(--accent-strong)" }} target="_blank">
                          {item.kind === "sponsored" ? item.ctaLabel ?? t("openSponsor") : t("openArticle")}
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              )) : (
                <>
                  <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("feedEmpty")}</p>
                    <p className="mt-2 text-lg font-bold">{t("feedEmptyTitle")}</p>
                    <p className="mt-2 text-sm muted">{t("feedEmptyDesc")}</p>
                  </div>
                  <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("feedSetupTitle")}</p>
                    <p className="mt-2 text-sm muted">{t("feedSetupDesc")}</p>
                  </div>
                </>
              )}
            </div>

            {user.role === "ADMIN" ? <NewsSyncButton tournamentId={currentTournament?.id} /> : null}
          </section>
        </aside>
      </section>
    </div>
  );
}
