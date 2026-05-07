"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";

export function NewsSyncButton({ tournamentId }: { tournamentId?: string | null }) {
  const t = useTranslations("newsSyncButton");
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
      setError(payload?.error ?? t("syncError"));
      return;
    }

    setMessage(t("synced", { count: payload?.totalSynced ?? 0 }));
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
        {loading ? t("syncing") : t("sync")}
      </button>
      {message ? <p className="text-xs" style={{ color: "var(--accent-strong)" }}>{message}</p> : null}
      {error ? <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}
