/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * We schedule an hourly newsroom sync here so admins don't have to click the
 * "Sync news" button manually. The manual endpoint stays available and works
 * exactly as before; this just runs the same `syncTournamentNews` on a timer.
 *
 * This relies on the app running as a long-lived Node server (it does on
 * Railway via `next start`). It is a no-op on the edge runtime and when no news
 * provider is configured (e.g. local dev without API keys).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Explicit off-switch.
  if ((process.env.NEWS_SYNC_CRON ?? "").trim().toLowerCase() === "off") return;

  // Nothing to sync if no provider key is configured.
  if (!process.env.GNEWS_API_KEY && !process.env.NEWSAPI_KEY) return;

  // Guard against duplicate timers across HMR / repeated register() calls.
  const globalRef = globalThis as typeof globalThis & { __newsSyncTimer?: ReturnType<typeof setInterval> };
  if (globalRef.__newsSyncTimer) return;

  const minutes = Number(process.env.NEWS_SYNC_INTERVAL_MINUTES ?? "60");
  const intervalMs = (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) * 60_000;

  async function run() {
    try {
      const { syncTournamentNews } = await import("@/lib/news/sync");
      const result = await syncTournamentNews(null);
      console.log(
        `[news-sync] synced ${result.totalSynced} article(s) across ${result.tournaments.length} tournament(s)`
      );
    } catch (err) {
      console.error("[news-sync] failed:", err instanceof Error ? err.message : err);
    }
  }

  globalRef.__newsSyncTimer = setInterval(run, intervalMs);
  // Run once shortly after boot so news is fresh right after a deploy.
  setTimeout(run, 15_000);
  console.log(`[news-sync] scheduled every ${intervalMs / 60_000} min`);
}
