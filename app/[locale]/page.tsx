import { randomInt } from "crypto";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/lib/navigation";

function memberColor(seed: string): string {
  const palette = ["#10b981", "#f59e0b", "#a855f7", "#0ea5e9", "#ef4444"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function DemoAvatar({ name, size = 22 }: { name: string; size?: number }) {
  const color = memberColor(name);
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        fontFamily: "var(--font-mono)",
        color: "#fff",
        flexShrink: 0,
        border: "2px solid var(--bg)",
      }}
    >
      {name[0].toUpperCase()}
    </span>
  );
}

export default async function Home() {
  const session = await getServerSession(authOptions);
  const hasSession = !!session?.user;
  const t = await getTranslations("landing");
  const tickerOffset = randomInt(3);

  const allTickerItems = [
    "ARG 2 – 1 BRA · FT  +5 pts",
    "FRA 3 – 0 CAN · FT  +5 pts",
    "ENG 1 – 1 USA · FT  +3 pts",
    "ESP 1 – 0 GER · FT  +3 pts",
    "POR 4 – 1 MAR · FT  +5 pts",
    "NED 2 – 2 MEX · FT  +3 pts",
  ];
  const tickerItems = [
    ...allTickerItems.slice(tickerOffset),
    ...allTickerItems.slice(0, tickerOffset),
  ];

  const demoRows = [
    { rank: 1, name: "Theo K.", round: "+11 MD2", total: 192, delta: "+7", move: 0, color: "#10b981" },
    { rank: 2, name: "You", round: "+8 MD2", total: 184, delta: "+3", move: 1, color: "#f59e0b", isMe: true },
    { rank: 3, name: "Marisol", round: "+9 MD2", total: 181, delta: "+4", move: -1, color: "#a855f7" },
    { rank: 4, name: "Jaden", round: "+5 MD2", total: 172, delta: "—", move: 0, color: "#0ea5e9" },
  ];

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Nav */}
      <nav
        className="row pad-5"
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
          background: "var(--paper)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "var(--ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#10b981",
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
              fontSize: 14,
            }}
          >
            P
          </div>
          <span className="bold text-md">Pitchside</span>
          <span className="chip chip-outline" style={{ marginLeft: 4 }}>WC 2026</span>
        </div>
        <div className="row gap-3" style={{ alignItems: "center" }}>
          <LocaleSwitcher className="btn btn-ghost btn-sm" />
          <ThemeToggle className="btn btn-ghost btn-sm" />
          <Link
            href={hasSession ? "/dashboard" : "/auth/signin"}
            className="btn btn-sm"
          >
            {hasSession ? t("openDashboard") : t("signIn")}
          </Link>
          <Link
            href={hasSession ? "/dashboard/groups" : "/auth/signin"}
            className="btn btn-sm btn-accent"
          >
            {hasSession ? t("myGroups") : t("joinWithCode")}
          </Link>
        </div>
      </nav>

      {/* Ticker */}
      <div className="ticker" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="row gap-2" style={{ alignItems: "center", paddingRight: 40 }}>
              <span className="live-dot" style={{ opacity: 0.5 }} />
              <span className="text-xs mono" style={{ whiteSpace: "nowrap", letterSpacing: "0.08em" }}>
                {item}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Body — two col on xl */}
      <div
        style={{ flex: 1, display: "grid", overflow: "hidden" }}
        className="xl:grid-cols-[1.1fr_1fr]"
      >
        {/* Left — editorial copy */}
        <section
          style={{
            padding: "56px 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 28,
            borderRight: "1px solid var(--border)",
          }}
        >
          <span className="eyebrow" style={{ color: "var(--accent-strong)" }}>
            Issue №26 · World Cup Predictions
          </span>

          <h1
            className="display"
            style={{
              fontSize: "clamp(44px, 6vw, 88px)",
              margin: 0,
              lineHeight: 0.92,
            }}
          >
            {t("heroLine1")}<br />
            {t("heroLine2")}<br />
            <span style={{ color: "var(--accent-strong)" }}>{t("heroLine3")}</span>
          </h1>

          <p className="text-lg muted" style={{ maxWidth: 520, lineHeight: 1.45, margin: 0 }}>
            {t("description")}
          </p>

          <div className="row gap-3" style={{ flexWrap: "wrap" }}>
            <Link
              href={hasSession ? "/dashboard" : "/auth/signin"}
              className="btn btn-lg btn-accent"
            >
              {hasSession ? t("openDashboard") : t("startGroup")}
            </Link>
            {!hasSession && (
              <Link href="/auth/signin" className="btn btn-lg">
                {t("signIn")}
              </Link>
            )}
          </div>

          {/* Scoring + social proof */}
          <div className="row gap-8" style={{ marginTop: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="col gap-2">
              <span className="eyebrow">{t("scoringLabel")}</span>
              <div className="row gap-4" style={{ alignItems: "baseline" }}>
                {[
                  { n: "5", l: t("exactScore"), accent: true },
                  { n: "3", l: t("resultLabel"), accent: false },
                  { n: "2", l: t("standingLabel"), accent: false },
                ].map((s, i) => (
                  <div key={i} className="col" style={{ alignItems: "flex-start" }}>
                    <span
                      className="display tabnum text-3xl"
                      style={{ color: s.accent ? "var(--accent-strong)" : "var(--ink)" }}
                    >
                      +{s.n}
                    </span>
                    <span className="text-xs mono muted" style={{ letterSpacing: "0.12em" }}>
                      {s.l.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="col gap-2">
              <div className="row">
                {["T", "M", "J", "S", "+"].map((c, i) => (
                  <span key={i} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i, position: "relative" }}>
                    <DemoAvatar name={c} size={32} />
                  </span>
                ))}
              </div>
              <span className="text-xs muted" style={{ maxWidth: 220 }}>
                {t("socialProof")}
              </span>
            </div>
          </div>
        </section>

        {/* Right — data tease */}
        <section
          style={{
            padding: 36,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            background: "var(--paper-strong)",
            overflowY: "auto",
          }}
        >
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <span className="eyebrow">{t("peekTitle")}</span>
            <span className="live-dot" />
          </div>

          {/* Sample group leaderboard */}
          <div className="surface" style={{ padding: 20 }}>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div className="col gap-1">
                <span className="text-xs muted mono" style={{ letterSpacing: "0.16em" }}>GROUP · INVITE 84KZ-PQ</span>
                <span className="display text-2xl">The Touchline Tribunal</span>
              </div>
              <span className="chip chip-accent">12 members</span>
            </div>
            <table className="tabular" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Member</th>
                  <th style={{ textAlign: "right" }}>Round</th>
                  <th style={{ textAlign: "right" }}>Points</th>
                  <th style={{ textAlign: "right" }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {demoRows.map((r) => (
                  <tr
                    key={r.name}
                    style={{ background: r.isMe ? "var(--accent-soft)" : "transparent" }}
                  >
                    <td className="mono muted">
                      <span className="row gap-1" style={{ alignItems: "center" }}>
                        <span>{r.rank}</span>
                        <span
                          style={{
                            fontSize: 9,
                            color: r.move > 0 ? "var(--accent-strong)" : r.move < 0 ? "var(--live)" : "var(--muted-2)",
                          }}
                        >
                          {r.move > 0 ? "▲" : r.move < 0 ? "▼" : ""}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="row gap-2" style={{ alignItems: "center" }}>
                        <span
                          style={{
                            width: 22, height: 22, borderRadius: 999, background: r.color,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", color: "#fff",
                          }}
                        >
                          {r.name[0]}
                        </span>
                        <span className="bold">{r.name}</span>
                      </span>
                    </td>
                    <td className="mono muted" style={{ textAlign: "right" }}>{r.round}</td>
                    <td className="mono extrabold tabnum" style={{ textAlign: "right" }}>{r.total}</td>
                    <td className="mono" style={{ textAlign: "right", color: r.delta === "—" ? "var(--muted-2)" : "var(--accent-strong)" }}>
                      {r.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Testimonial */}
          <div className="surface-quiet" style={{ padding: 20, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span className="display" style={{ fontSize: 52, color: "var(--accent-strong)", lineHeight: 0.6, marginTop: 6 }}>"</span>
            <div className="col gap-2">
              <p className="text-md" style={{ margin: 0, lineHeight: 1.4 }}>
                We replaced our paper bracket with this. It got 100% participation in two days. The arguments have been world-class.
              </p>
              <span className="text-xs muted mono" style={{ letterSpacing: "0.12em" }}>
                — SAM L., NORTHFIELD STUDIO
              </span>
            </div>
          </div>

          {/* Invite code CTA */}
          <div className="surface-broadcast row" style={{ alignItems: "center", gap: 12, padding: 16 }}>
            <span className="text-xs mono" style={{ color: "#94a3b8", letterSpacing: "0.16em" }}>{t("haveCode")}</span>
            <Link
              href={hasSession ? "/dashboard/groups" : "/auth/signin"}
              className="btn btn-accent btn-sm"
              style={{ marginLeft: "auto" }}
            >
              {t("joinGroup")}
            </Link>
          </div>

          {/* How it works */}
          <div className="col gap-2">
            <span className="eyebrow">{t("howItWorks")}</span>
            {[
              { n: "01", title: t("step1Title"), desc: t("step1Desc") },
              { n: "02", title: t("step2Title"), desc: t("step2Desc") },
              { n: "03", title: t("step3Title"), desc: t("step3Desc") },
            ].map((step) => (
              <div
                key={step.n}
                className="row gap-3"
                style={{
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  background: "var(--paper)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                <span className="mono extrabold" style={{ color: "var(--accent-strong)", fontSize: 11, paddingTop: 2 }}>
                  {step.n}
                </span>
                <div className="col" style={{ gap: 2 }}>
                  <span className="bold text-sm">{step.title}</span>
                  <span className="text-xs muted">{step.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
