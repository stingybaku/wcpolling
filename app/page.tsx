import { randomInt } from "crypto";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

const heroImages = [
  "/landing/hero-1.jpg",
  "/landing/hero-2.jpg",
  "/landing/hero-3.jpg",
  "/landing/hero-4.jpg",
];

export default async function Home() {
  const session = await getServerSession(authOptions);
  const heroImage = heroImages[randomInt(heroImages.length)];

  return (
    <div className="page-shell overflow-hidden">
      <div className="absolute right-4 top-4 z-20 md:right-8 md:top-8">
        <ThemeToggle className="surface rounded-full px-4 py-2 text-sm font-semibold" />
      </div>

      <main className="grid min-h-screen grid-cols-1 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="hero-surface landing-hero-media relative flex min-h-[60vh] flex-col overflow-hidden px-6 py-8 md:px-10 md:py-10 xl:px-14 xl:py-12" style={{ backgroundImage: `url(${heroImage})` }}>
          <div className="relative z-10 max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>
              Build your room. Back your picks. Chase the table.
            </p>
            <h1 className="display-title mt-4 max-w-5xl text-6xl leading-[0.92] md:text-8xl xl:text-[8.5rem]">
              The control room for Leagues and Tournament predictions.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 muted md:text-lg">
              Create private groups, draft scorelines, lock one pick per league, and let live results redraw the leaderboard instantly.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="rounded-[1.4rem] px-6 py-4 text-center text-sm font-extrabold uppercase tracking-[0.22em] text-white"
                href={session?.user ? "/dashboard" : "/auth/signin"}
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
              >
                {session?.user ? "Open Dashboard" : "Start Predicting"}
              </Link>
              <Link className="surface rounded-[1.4rem] px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.2em]" href="/auth/signin">
                Sign in
              </Link>
            </div>
          </div>

          <div className="relative z-10 mt-8 stat-grid">
            <div className="surface stat-card rounded-[1.8rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] muted">Game loop</p>
              <p className="mt-3 text-2xl font-extrabold">Draft picks, submit once, rise by points.</p>
            </div>
            <div className="surface stat-card rounded-[1.8rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] muted">Social play</p>
              <p className="mt-3 text-2xl font-extrabold">Invite-code groups for friends, offices, or fan clubs.</p>
            </div>
            <div className="surface stat-card rounded-[1.8rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] muted">Admin scoring</p>
              <p className="mt-3 text-2xl font-extrabold">Results update standings as soon as matches are finalized.</p>
            </div>
          </div>
        </section>

        <section className="flex min-h-[40vh] flex-col justify-center px-6 py-8 md:px-10 md:py-10 xl:px-10 xl:py-12">
          <div className="surface-strong rounded-[2rem] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">How it works</p>
            <div className="mt-5 space-y-4">
              <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--accent-strong)" }}>01</p>
                <p className="mt-2 text-lg font-bold">Create or join a prediction room</p>
                <p className="mt-1 text-sm muted">Spin up a private league and share the invite code with your group.</p>
              </div>
              <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--accent-strong)" }}>02</p>
                <p className="mt-2 text-lg font-bold">Build multiple scoreline drafts</p>
                <p className="mt-1 text-sm muted">Experiment freely, then mark one prediction set as your live selection.</p>
              </div>
              <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--accent-strong)" }}>03</p>
                <p className="mt-2 text-lg font-bold">Watch the table move after every result</p>
                <p className="mt-1 text-sm muted">Exact scores and correct outcomes convert into leaderboard points automatically.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
