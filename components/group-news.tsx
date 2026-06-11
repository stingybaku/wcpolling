"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NewsImage } from "@/components/news-image";

type Article = {
  id: string;
  title: string;
  url: string;
  sourceName: string | null;
  provider: string;
  publishedAt: string;
  imageUrl: string | null;
};

export function GroupNews({ tournamentId }: { tournamentId?: string | null }) {
  const t = useTranslations("groups.groupRoom");
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    fetch(`/api/news?tournamentId=${tournamentId}&limit=6`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setArticles(data?.articles ?? []); })
      .catch(() => { if (!cancelled) setArticles([]); });
    return () => { cancelled = true; };
  }, [tournamentId]);

  // Subtle by design: stay invisible until we know there's news to show.
  if (!articles || articles.length === 0) return null;

  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "20px" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, background: "transparent", border: "none", padding: 0, cursor: "pointer",
          color: "var(--ink)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ fontSize: 16 }}>📰</span>
          <span className="display text-md">{t("newsTitle")}</span>
          <span className="chip" style={{ fontSize: 10, padding: "1px 7px" }}>{articles.length}</span>
        </span>
        <span aria-hidden style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>▾</span>
      </button>

      {open && (
        <div className="col gap-3" style={{ marginTop: 12 }}>
          {articles.map((article) => (
            <a
              key={article.id}
              href={article.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              <div style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px dashed var(--border)" }}>
                {article.imageUrl && <NewsImage src={article.imageUrl} />}
                <div style={{ minWidth: 0 }}>
                  <span className="text-xs mono muted" style={{ fontSize: 10, letterSpacing: "0.1em" }}>
                    {article.sourceName ?? article.provider} ·{" "}
                    {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(article.publishedAt))}
                  </span>
                  <p className="bold text-sm" style={{ marginTop: 3, lineHeight: 1.35 }}>{article.title}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
