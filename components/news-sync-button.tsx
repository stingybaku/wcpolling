"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewsSyncButton({ tournamentId }: { tournamentId?: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function syncNews() {
    setLoading(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/admin/news/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId }),
    });

    setLoading(false);

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Could not sync newsroom.");
      return;
    }

    setMessage(`Synced ${payload?.totalSynced ?? 0} articles.`);
    router.refresh();
  }

  return (
    <div className="mt-5 space-y-2">
      <button
        className="rounded-[1.2rem] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        disabled={loading}
        onClick={() => void syncNews()}
        style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
        type="button"
      >
        {loading ? "Syncing newsroom..." : "Sync newsroom"}
      </button>
      {message ? <p className="text-xs" style={{ color: "var(--accent-strong)" }}>{message}</p> : null}
      {error ? <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}
