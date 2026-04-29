"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SignInPage() {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "register") {
      setMessage("Creating account...");
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Registration failed.");
        return;
      }
      setMode("signin");
      setMessage("Account created. Sign in with your email and password.");
      return;
    }

    setMessage("Signing in...");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setMessage("Sign-in failed. Check your email and password.");
    } else {
      setMessage("Sign-in successful. Redirecting...");
      window.location.href = "/dashboard";
    }
  }

  return (
    <div className="page-shell grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hero-surface relative hidden min-h-screen flex-col justify-between p-10 lg:flex xl:p-14">
        <div className="flex items-start justify-between">
          <Link href="/" className="display-title text-6xl leading-none">WCP</Link>
          <ThemeToggle className="surface rounded-full px-4 py-2 text-sm font-semibold" />
        </div>

        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>
            Matchday starts here
          </p>
          <h1 className="display-title mt-4 text-8xl leading-[0.9]">Call every score before kickoff.</h1>
          <p className="mt-4 text-lg leading-8 muted">
            Private leagues, group invites, one locked submission per room, and a live table that moves with every result.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="surface rounded-[1.6rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Providers</p>
            <p className="mt-2 text-xl font-bold">Google, Facebook, or secure email-password access.</p>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-8 md:px-8">
        <div className="w-full max-w-xl space-y-6">
          <div className="flex items-center justify-between lg:hidden">
            <Link href="/" className="display-title text-5xl leading-none">WCP</Link>
            <ThemeToggle className="surface rounded-full px-4 py-2 text-sm font-semibold" />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] muted">Sign in</p>
            <h1 className="display-title mt-3 text-6xl leading-none">Join the pool.</h1>
            <p className="mt-3 max-w-lg text-base leading-7 muted">Use email and password for local access, or connect an OAuth provider to enter the full dashboard.</p>
          </div>

          <div className="surface rounded-[2rem] p-6 md:p-8">
            <form onSubmit={onSubmit} className="space-y-4">
              {mode === "register" ? (
                <div className="space-y-2">
                  <label className="block text-sm font-semibold">Name</label>
                  <input
                    className="field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    type="text"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Email</label>
                <input
                  className="field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold">Password</label>
                <input
                  className="field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  minLength={8}
                  required
                />
              </div>
              <button
                className="w-full rounded-[1.2rem] px-4 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                type="submit"
              >
                {mode === "signin" ? "Sign in with Email" : "Create account"}
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                className="text-sm font-semibold underline underline-offset-4"
                onClick={() => {
                  setMode((current) => current === "signin" ? "register" : "signin");
                  setMessage("");
                }}
                type="button"
              >
                {mode === "signin" ? "Need an account? Register" : "Already have an account? Sign in"}
              </button>
              {mode === "signin" && (
                <Link href="/auth/reset-password" className="text-sm muted underline underline-offset-4">
                  Forgot password?
                </Link>
              )}
            </div>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
              <span className="text-xs font-semibold uppercase tracking-[0.3em] muted">or</span>
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            </div>

            <div className="space-y-3">
              <button onClick={() => signIn("google")} className="surface-strong w-full rounded-[1.2rem] px-4 py-4 text-sm font-bold">Continue with Google</button>
              <button onClick={() => signIn("facebook")} className="surface-strong w-full rounded-[1.2rem] px-4 py-4 text-sm font-bold">Continue with Facebook</button>
            </div>

            {message ? <p className="mt-4 text-sm muted">{message}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
