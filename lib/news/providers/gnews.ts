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
  errors?: string[] | Record<string, string>;
};

// GNews query syntax only accepts words, quoted phrases, and the AND/OR/NOT
// operators. Punctuation such as an em dash (e.g. "World Cup — Staged") triggers
// a "query has a syntax error" 400, so strip anything that isn't a letter,
// number, or whitespace before building the query.
function sanitizeTerm(term: string) {
  return term.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function buildQuery(context: NewsSyncContext) {
  const parts = [context.tournamentName, ...context.tags.map((tag) => tag.name)];
  const cleaned = parts.map(sanitizeTerm).filter(Boolean);
  return Array.from(new Set(cleaned)).join(" OR ");
}

// GNews returns `errors` as either an array of strings or an object keyed by the
// offending parameter (e.g. { q: "…" }); normalize both to a readable message.
function extractError(errors: unknown): string | null {
  if (Array.isArray(errors)) return errors[0] ?? null;
  if (errors && typeof errors === "object") {
    const values = Object.values(errors as Record<string, unknown>);
    return values.length > 0 ? String(values[0]) : null;
  }
  return null;
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
        throw new Error(extractError(payload?.errors) || `GNews request failed with ${response.status}`);
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
