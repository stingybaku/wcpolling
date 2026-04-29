import { prisma } from "@/lib/prisma";
import { createGNewsProvider } from "@/lib/news/providers/gnews";
import { createNewsApiProvider } from "@/lib/news/providers/newsapi";
import { NewsProvider, NewsSyncContext, NormalizedNewsArticle } from "@/lib/news/types";

function pickProvider(): NewsProvider | null {
  const configuredProvider = (process.env.NEWS_PROVIDER ?? "").trim().toLowerCase();

  if (configuredProvider === "newsapi" && process.env.NEWSAPI_KEY) {
    return createNewsApiProvider(process.env.NEWSAPI_KEY);
  }

  if (configuredProvider === "gnews" && process.env.GNEWS_API_KEY) {
    return createGNewsProvider(process.env.GNEWS_API_KEY);
  }

  if (!configuredProvider && process.env.NEWSAPI_KEY) {
    return createNewsApiProvider(process.env.NEWSAPI_KEY);
  }

  if (!configuredProvider && process.env.GNEWS_API_KEY) {
    return createGNewsProvider(process.env.GNEWS_API_KEY);
  }

  return null;
}

function buildMatchedTags(context: NewsSyncContext, article: NormalizedNewsArticle) {
  const haystack = `${article.title} ${article.summary ?? ""}`.toLowerCase();
  return context.tags
    .filter((tag) => haystack.includes(tag.name.toLowerCase()) || haystack.includes(tag.slug.toLowerCase()))
    .map((tag) => tag.name);
}

function dedupeArticles(articles: NormalizedNewsArticle[]) {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = article.url.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function syncTournamentNews(tournamentId?: string | null) {
  const provider = pickProvider();
  if (!provider) {
    throw new Error("No newsroom provider configured. Set NEWS_PROVIDER with NEWSAPI_KEY or GNEWS_API_KEY.");
  }

  const tournaments = await prisma.tournament.findMany({
    where: {
      archivedAt: null,
      ...(tournamentId ? { id: tournamentId } : {}),
    },
    include: {
      tags: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const results: Array<{ tournamentId: string; tournamentName: string; synced: number }> = [];

  for (const tournament of tournaments) {
    const context: NewsSyncContext = {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentSlug: tournament.slug,
      tags: tournament.tags.map((tag) => ({ name: tag.name, slug: tag.slug })),
    };

    const fetchedArticles = dedupeArticles(await provider.fetchArticles(context));
    let synced = 0;

    for (const article of fetchedArticles) {
      const matchedTags = buildMatchedTags(context, article);
      await prisma.newsArticle.upsert({
        where: { tournamentId_url: { tournamentId: tournament.id, url: article.url } },
        update: {
          tournamentId: tournament.id,
          provider: article.provider,
          providerArticleId: article.providerArticleId ?? null,
          title: article.title,
          summary: article.summary ?? null,
          sourceName: article.sourceName ?? null,
          imageUrl: article.imageUrl ?? null,
          publishedAt: article.publishedAt,
          fetchedAt: new Date(),
          matchedTags: matchedTags.join(", ") || null,
        },
        create: {
          tournamentId: tournament.id,
          provider: article.provider,
          providerArticleId: article.providerArticleId ?? null,
          title: article.title,
          summary: article.summary ?? null,
          url: article.url,
          sourceName: article.sourceName ?? null,
          imageUrl: article.imageUrl ?? null,
          publishedAt: article.publishedAt,
          fetchedAt: new Date(),
          matchedTags: matchedTags.join(", ") || null,
        },
      });
      synced += 1;
    }

    results.push({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      synced,
    });
  }

  return {
    provider: provider.name,
    tournaments: results,
    totalSynced: results.reduce((sum, item) => sum + item.synced, 0),
  };
}

export async function listTournamentNews(tournamentId?: string | null, take = 12) {
  return prisma.newsArticle.findMany({
    where: tournamentId ? { tournamentId } : undefined,
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take,
  });
}
