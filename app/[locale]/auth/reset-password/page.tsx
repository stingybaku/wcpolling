"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/lib/navigation";

type Phase = "request" | "confirm" | "done";

export default function ResetPasswordPage() {
  const t = useTranslations("auth.resetPassword");
  const [phase, setPhase] = useState<Phase>("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/reset-password/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? t("requestFailed"));
      return;
    }
    setMessage(data?.message ?? "Check the server console for your reset token.");
    setPhase("confirm");
  }

  async function confirmReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("passwordsDoNotMatch"));
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? t("resetFailed"));
      return;
    }
    setPhase("done");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>
          {phase === "done" ? t("donePhaseLabel") : t("requestPhaseLabel")}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold">
          {phase === "request" && t("forgotTitle")}
          {phase === "confirm" && t("tokenTitle")}
          {phase === "done" && t("doneTitle")}
        </h1>

        {message ? (
          <div className="mt-4 rounded-[1.2rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--accent-soft)" }}>
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-[1.2rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            {error}
          </div>
        ) : null}

        {phase === "request" && (
          <form onSubmit={requestReset} className="surface mt-6 rounded-[2rem] p-6 md:p-8">
            <div className="space-y-4">
              <input
                className="field"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                className="w-full rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                type="submit"
                disabled={loading}
              >
                {loading ? t("sending") : t("sendTokenButton")}
              </button>
            </div>
            <p className="mt-4 text-center text-sm muted">
              {t("alreadyHaveToken")}{" "}
              <button type="button" className="font-bold underline" onClick={() => setPhase("confirm")}>
                {t("enterHere")}
              </button>
            </p>
          </form>
        )}

        {phase === "confirm" && (
          <form onSubmit={confirmReset} className="surface mt-6 rounded-[2rem] p-6 md:p-8">
            <div className="space-y-4">
              <input
                className="field"
                type="text"
                placeholder={t("tokenPlaceholder")}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
              <input
                className="field"
                type="password"
                placeholder={t("newPasswordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <input
                className="field"
                type="password"
                placeholder={t("confirmPasswordPlaceholder")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <button
                className="w-full rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                type="submit"
                disabled={loading}
              >
                {loading ? t("resetting") : t("resetButton")}
              </button>
            </div>
          </form>
        )}

        {phase === "done" && (
          <div className="surface mt-6 rounded-[2rem] p-6 md:p-8 text-center">
            <p className="text-base">{t("passwordUpdated")}</p>
            <Link
              href="/auth/signin"
              className="mt-5 inline-block rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
            >
              {t("signInNow")}
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-sm muted">
          <Link href="/auth/signin" className="font-bold underline">{t("backToSignIn")}</Link>
        </p>
      </div>
    </div>
  );
}
