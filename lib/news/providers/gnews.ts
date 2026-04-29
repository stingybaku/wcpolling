import { NewsProvider, NewsSyncContext, NormalizedNewsArticle } from "@/lib/news/types";

type GNewsResponse = {
  totalArticles?: number;
  articles?: Array<{
    title?: string | null;
    description?: string | null;
    url?: string | null;
    image?: string | null;
    publishedAt?: string | null;
    source?: {
      name?: string | null;
      url?: string | null;
    } | null;
  }>;
  errors?: string[];
};

function buildQuery(context: NewsSyncContext) {
  const parts = [context.tournamentName, ...context.tags.map((tag) => tag.name)];
  return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean))).join(" OR ");
}

export function createGNewsProvider(apiKey: string): NewsProvider {
  return {
    name: "gnews",
    async fetchArticles(context: NewsSyncContext): Promise<NormalizedNewsArticle[]> {
      const query = buildQuery(context);
      if (!query) return [];

      const url = new URL("https://gnews.io/api/v4/search");
      url.searchParams.set("q", query);
      url.searchParams.set("lang", "en");
      url.searchParams.set("max", "12");
      url.searchParams.set("apikey", apiKey);

      const response = await fetch(url.toString(), { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as GNewsResponse | null;
      if (!response.ok) {
        throw new Error(payload?.errors?.[0] || `GNews request failed with ${response.status}`);
      }

      return (payload?.articles ?? []).flatMap((article) => {
        if (!article.title || !article.url || !article.publishedAt) return [];
        return [{
          provider: "gnews",
          providerArticleId: article.url,
          title: article.title,
          summary: article.description ?? null,
          url: article.url,
          sourceName: article.source?.name ?? null,
          imageUrl: article.image ?? null,
          publishedAt: new Date(article.publishedAt),
        } satisfies NormalizedNewsArticle];
      });
    },
  };
}
