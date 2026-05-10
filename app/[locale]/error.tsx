"use client";

import { useEffect } from "react";
import { Link } from "@/lib/navigation";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Something went wrong</p>
        <h2 className="display-title mt-3 text-5xl leading-none">Unexpected error</h2>
        <p className="mt-4 text-base muted max-w-sm">
          An error occurred while loading this page. You can try again or return to the dashboard.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={reset}
          className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="surface rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
