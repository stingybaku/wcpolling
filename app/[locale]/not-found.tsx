import { Link } from "@/lib/navigation";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Page not found</p>
        <h2 className="display-title mt-3 text-8xl leading-none" style={{ color: "var(--accent-strong)" }}>404</h2>
        <p className="mt-4 text-base muted max-w-sm">
          This page doesn't exist. It may have been moved or the URL might be incorrect.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="surface rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
