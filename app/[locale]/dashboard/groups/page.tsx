"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/lib/navigation";

type Group = {
  id: string;
  name: string;
  inviteCode: string;
  description?: string;
  tournament?: { id: string; name: string } | null;
  owner: { name?: string | null; email?: string | null };
  memberships: Array<{ user: { name?: string | null; email?: string | null } }>;
};

function GroupsPageInner() {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const redirectError = searchParams.get("error");

  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string>(redirectError === "not-member" ? t("notMember") : "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteCode, setInviteCode] = useState(searchParams.get("code") ?? "");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function fetchGroups() {
    const res = await fetch("/api/groups");
    if (!res.ok) {
      setError(t("loadError"));
      return;
    }
    const data = await res.json();
    setGroups(data.groups || []);
  }

  useEffect(() => {
    fetchGroups();
  }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(t("createError"));
      return;
    }
    setName("");
    setDescription("");
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
    await fetchGroups();
  }

  function copyCode(group: Group) {
    void navigator.clipboard.writeText(group.inviteCode);
    setCopiedId(group.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="space-y-6">
      <section className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>{t("tagline")}</p>
            <h2 className="display-title mt-3 text-5xl leading-none md:text-7xl">{t("title")}</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 muted">{t("subtitle")}</p>
          </div>
          <Link className="surface rounded-[1.4rem] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em]" href="/dashboard">{t("backToDashboard")}</Link>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={createGroup} className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("createGroup")}</p>
          <div className="mt-5 space-y-4">
            <input className="field" placeholder={t("groupNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
            <textarea className="field min-h-[7.5rem]" placeholder={t("descriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} />
            <p className="text-sm muted">{t("createGroupNote")}</p>
            <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white" disabled={loading} style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="submit">{t("createButton")}</button>
          </div>
        </form>

        <form onSubmit={joinGroup} className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("joinGroup")}</p>
          <div className="mt-5 space-y-4">
            <input className="field" placeholder={t("inviteCodePlaceholder")} value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
            <button className="rounded-[1.3rem] border px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em]" disabled={loading} style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }} type="submit">{t("joinButton")}</button>
          </div>
        </form>
      </section>

      {error ? <div className="rounded-[1.5rem] border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 10%, transparent 90%)" }}>{error}</div> : null}

      <section className="surface rounded-[2rem] p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("yourLeagues")}</p>
            <h3 className="mt-2 text-3xl font-extrabold">{t("activeGroupRooms")}</h3>
          </div>
          <p className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>{t("total", { count: groups.length })}</p>
        </div>

        {groups.length === 0 ? (
          <p className="mt-5 text-base muted">{t("noGroups")}</p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {groups.map((group) => (
              <article key={group.id} className="surface-strong rounded-[1.7rem] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-extrabold">{group.name}</p>
                    <p className="mt-1 text-sm muted">{t("owner", { name: group.owner?.name ?? group.owner?.email ?? tCommon("unknown") })}</p>
                    <p className="mt-1 text-sm muted">{t("tournament", { name: group.tournament?.name ?? tCommon("unknown") })}</p>
                  </div>
                  <Link href={`/dashboard/groups/${group.id}`} className="rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}>
                    {tCommon("open")}
                  </Link>
                </div>
                <p className="mt-4 text-sm muted">{group.description || t("noDescription")}</p>
                <div className="mt-5 flex items-center justify-between rounded-[1.2rem] border px-4 py-3" style={{ borderColor: "var(--border)" }}>
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
