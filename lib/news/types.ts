export type NormalizedNewsArticle = {
  provider: string;
  providerArticleId?: string | null;
  title: string;
  summary?: string | null;
  url: string;
  sourceName?: string | null;
  imageUrl?: string | null;
  publishedAt: Date;
};

export type NewsSyncContext = {
  tournamentId: string;
  tournamentName: string;
  tournamentSlug: string;
  tags: Array<{ name: string; slug: string }>;
};

export type NewsProvider = {
  name: string;
  fetchArticles(context: NewsSyncContext): Promise<NormalizedNewsArticle[]>;
};
