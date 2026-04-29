import { NewsProvider, NewsSyncContext, NormalizedNewsArticle } from "@/lib/news/types";

type NewsApiResponse = {
  status: string;
  articles?: Array<{
    source?: { name?: string | null };
    author?: string | null;
    title?: string | null;
    description?: string | null;
    url?: string | null;
    urlToImage?: string | null;
    publishedAt?: string | null;
  }>;
  message?: string;
};

function buildQuery(context: NewsSyncContext) {
  const parts = [context.tournamentName, ...context.tags.map((tag) => tag.name)];
  return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean))).join(" OR ");
}

export function createNewsApiProvider(apiKey: string): NewsProvider {
  return {
    name: "newsapi",
    async fetchArticles(context: NewsSyncContext): Promise<NormalizedNewsArticle[]> {
      const query = buildQuery(context);
      if (!query) return [];

      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("q", query);
      url.searchParams.set("language", "en");
      url.searchParams.set("sortBy", "publishedAt");
      url.searchParams.set("pageSize", "12");

      const response = await fetch(url.toString(), {
        headers: {
          "X-Api-Key": apiKey,
        },
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as NewsApiResponse | null;
      if (!response.ok) {
        throw new Error(payload?.message || `NewsAPI request failed with ${response.status}`);
      }

      return (payload?.articles ?? []).flatMap((article) => {
        if (!article.title || !article.url || !article.publishedAt) return [];
        return [{
          provider: "newsapi",
          providerArticleId: article.url,
          title: article.title,
          summary: article.description ?? null,
          url: article.url,
          sourceName: article.source?.name ?? null,
          imageUrl: article.urlToImage ?? null,
          publishedAt: new Date(article.publishedAt),
        } satisfies NormalizedNewsArticle];
      });
    },
  };
}
