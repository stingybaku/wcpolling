"use client";

import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/lib/navigation";

type Group = {
  id: string;
  name: string;
  inviteCode: string;
  description?: string;
  tournament?: { id: string; name: string; type?: string } | null;
  owner: { name?: string | null; email?: string | null };
  memberships: Array<{ user: { name?: string | null; email?: string | null } }>;
};

type Tournament = { id: string; name: string; type: string };

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

interface ModalProps {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  mounted: boolean;
}

function Modal({ onClose, title, children, mounted }: ModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!mounted) return null;

  const overlay = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--paper)",
          borderRadius: "var(--r-xl)",
          padding: 32,
          width: "min(480px, 90vw)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: "var(--ink-muted)" }}>
            {title}
          </p>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

// ---------------------------------------------------------------------------
// Inner page (needs useSearchParams, must be inside Suspense)
// ---------------------------------------------------------------------------

function GroupsPageInner() {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const redirectError = searchParams.get("error");
  const codeParam = searchParams.get("code") ?? "";

  const [mounted, setMounted] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);
  const [error, setError] = useState<string>(redirectError === "not-member" ? t("notMember") : "");

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [loading, setLoading] = useState(false);

  // Join form state
  const [inviteCode, setInviteCode] = useState(codeParam);

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(!!codeParam);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Portal safety — only render portals after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  async function fetchGroups() {
    const res = await fetch("/api/groups");
    if (!res.ok) { setError(t("loadError")); return; }
    const data = await res.json() as { groups?: Group[] };
    setGroups(data.groups ?? []);
  }

  async function fetchTournaments() {
    const res = await fetch("/api/tournaments");
    if (!res.ok) return;
    const data = await res.json() as { tournaments?: Tournament[] };
    const list: Tournament[] = data.tournaments ?? [];
    setTournaments(list);
    if (!tournamentId && list.length > 0) setTournamentId(list[0].id);
  }

  async function fetchCurrentTournament() {
    try {
      const res = await fetch("/api/tournament");
      if (!res.ok) return; // currentTournament stays null — show all
      const data = await res.json() as { tournament?: Tournament };
      if (data.tournament) setCurrentTournament(data.tournament);
    } catch {
      // network error — show all groups
    }
  }

  useEffect(() => {
    void fetchGroups();
    void fetchTournaments();
    void fetchCurrentTournament();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, tournamentId }),
    });
    setLoading(false);
    if (!res.ok) { setError(t("createError")); return; }
    setName("");
    setDescription("");
    setShowCreate(false);
    await fetchGroups();
  }

  async function joinGroup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(t("joinError"));
      return;
    }
    setInviteCode("");
    setShowJoin(false);
    await fetchGroups();
  }

  function copyCode(group: Group) {
    void navigator.clipboard.writeText(group.inviteCode);
    setCopiedId(group.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filteredGroups = groups.filter(
    (g) => !currentTournament || g.tournament?.id === currentTournament.id,
  );

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <section
        className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p
              className="text-xs font-semibold uppercase tracking-[0.34em]"
              style={{ color: "var(--accent-strong)" }}
            >
              {t("tagline")}
            </p>
            <h2 className="display-title mt-3 text-5xl leading-none md:text-7xl">{t("title")}</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 muted">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
              onClick={() => setShowCreate(true)}
            >
              {t("createButton")}
            </button>
            <button
              type="button"
              className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]"
              style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
              onClick={() => setShowJoin(true)}
            >
              {t("joinButton")}
            </button>
            <Link
              className="surface rounded-[1.4rem] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em]"
              href="/dashboard"
            >
              {t("backToDashboard")}
            </Link>
          </div>
        </div>
      </section>

      {/* Error banner */}
      {error ? (
        <div
          className="rounded-[1.5rem] border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            background: "color-mix(in srgb, var(--danger) 10%, transparent 90%)",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Your Leagues section */}
      <section className="surface rounded-[2rem] p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("yourLeagues")}</p>
            <h3 className="mt-2 text-3xl font-extrabold">{t("activeGroupRooms")}</h3>
          </div>
          <p
            className="rounded-full px-4 py-2 text-sm font-bold"
            style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
          >
            {t("total", { count: filteredGroups.length })}
          </p>
        </div>

        {filteredGroups.length === 0 ? (
          <p className="mt-5 text-base muted">{t("noGroups")}</p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredGroups.map((group) => (
              <article key={group.id} className="surface-strong rounded-[1.7rem] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-extrabold">{group.name}</p>
                    <p className="mt-1 text-sm muted">
                      {t("owner", { name: group.owner?.name ?? group.owner?.email ?? tCommon("unknown") })}
                    </p>
                    <p className="mt-1 text-sm muted">
                      {t("tournament", { name: group.tournament?.name ?? tCommon("unknown") })}
                      {group.tournament?.type === "STAGED" && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--accent-strong)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Staged
                        </span>
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/groups/${group.id}`}
                    className="rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-white"
                    style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
                  >
                    {tCommon("open")}
                  </Link>
                </div>
                <p className="mt-4 text-sm muted">{group.description || t("noDescription")}</p>
                <div
                  className="mt-5 flex items-center justify-between rounded-[1.2rem] border px-4 py-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.24em] muted">{t("inviteCode")}</span>
                    <span className="text-sm font-extrabold">{group.inviteCode}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyCode(group)}
                    className="rounded-full border px-3 py-1 text-xs font-bold"
                    style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                  >
                    {copiedId === group.id ? tCommon("copied") : tCommon("copy")}
                  </button>
                </div>
                <p className="mt-4 text-sm muted">{t("members", { count: group.memberships.length })}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Create Group modal */}
      {showCreate && (
        <Modal mounted={mounted} title={t("createGroup")} onClose={() => setShowCreate(false)}>
          <form onSubmit={createGroup} className="space-y-4">
            <input
              className="field"
              placeholder={t("groupNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <textarea
              className="field min-h-[7.5rem]"
              placeholder={t("descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {tournaments.length > 1 && (
              <select
                className="field"
                value={tournamentId}
                onChange={(e) => setTournamentId(e.target.value)}
              >
                {tournaments.map((trn) => (
                  <option key={trn.id} value={trn.id}>
                    {trn.name}{trn.type === "STAGED" ? " (Staged)" : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="text-sm muted">{t("createGroupNote")}</p>
            <button
              className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white"
              disabled={loading}
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}
              type="submit"
            >
              {t("createButton")}
            </button>
          </form>
        </Modal>
      )}

      {/* Join Group modal */}
      {showJoin && (
        <Modal mounted={mounted} title={t("joinGroup")} onClose={() => setShowJoin(false)}>
          <form onSubmit={joinGroup} className="space-y-4">
            <input
              className="field"
              placeholder={t("inviteCodePlaceholder")}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
            <button
              className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]"
              disabled={loading}
              style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
              type="submit"
            >
              {t("joinButton")}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default function DashboardGroupsPage() {
  return (
    <Suspense>
      <GroupsPageInner />
    </Suspense>
  );
}
