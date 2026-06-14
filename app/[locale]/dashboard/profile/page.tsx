"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";

type Profile = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  image?: string | null;
};

type Badge = {
  slug: string;
  icon: string | null;
  category: string;
  groupName: string | null;
  tournamentName: string | null;
  stageName: string | null;
  stageRoundLabel: string | null;
  params: Record<string, string | number> | null;
  awardedAt: string;
};

const KNOWN_ROUNDS = ["GQ", "R32", "R16", "QF", "SF", "Final"];

export default function DashboardProfilePage() {
  const t = useTranslations("profile");
  const tb = useTranslations("badges");
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        setError(t("loadError"));
        return;
      }

      const data = await res.json();
      setProfile(data.profile);
      setName(data.profile?.name ?? "");
    }

    async function loadBadges() {
      const res = await fetch("/api/badges");
      if (!res.ok) return;
      const data = await res.json();
      setBadges(data.badges ?? []);
    }

    void loadProfile();
    void loadBadges();
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    if (newPassword && newPassword !== confirmPassword) {
      setSaving(false);
      setError(t("passwordMismatch"));
      return;
    }

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, currentPassword, newPassword }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? t("updateError"));
      return;
    }

    const data = await res.json();
    setProfile(data.profile);
    setName(data.profile?.name ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage(newPassword ? t("profileAndPasswordUpdated") : t("profileUpdated"));
    router.refresh();
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setMessage("");

    const formData = new FormData();
    formData.append("avatar", file);

    const res = await fetch("/api/profile/avatar", {
      method: "POST",
      body: formData,
    });

    setUploading(false);
    event.target.value = "";

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? t("avatarUploadError"));
      return;
    }

    const data = await res.json();
    setProfile(data.profile);
    setMessage(t("avatarUpdated"));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>{t("tagline")}</p>
        <h2 className="display-title mt-3 text-5xl leading-none md:text-7xl">{t("title")}</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 muted">{t("subtitle")}</p>
      </section>

      <section className="content-grid">
        <form onSubmit={saveProfile} className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("editProfile")}</p>
          <div className="mt-5 space-y-4">
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
              <p className="text-sm font-semibold">{t("profilePhoto")}</p>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                {profile?.image ? (
                  <img alt={profile.name ?? profile.email ?? "Profile avatar"} className="h-20 w-20 rounded-full object-cover" src={profile.image} />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full text-xl font-extrabold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }}>
                    {(profile?.name ?? profile?.email ?? "U").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer rounded-[1rem] border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    <span>{uploading ? t("uploading") : t("uploadImage")}</span>
                    <input accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={uploadAvatar} type="file" />
                  </label>
                  <p className="text-xs muted">{t("uploadNote")}</p>
                </div>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">{t("displayName")}</label>
              <input className="field" onChange={(event) => setName(event.target.value)} placeholder={t("displayNamePlaceholder")} value={name} />
            </div>
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
              <p className="text-sm font-semibold">{t("changePassword")}</p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-semibold">{t("currentPassword")}</label>
                  <input
                    className="field"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder={t("currentPassword")}
                    type="password"
                    value={currentPassword}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">{t("newPassword")}</label>
                  <input
                    className="field"
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder={t("newPassword")}
                    type="password"
                    value={newPassword}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">{t("confirmNewPassword")}</label>
                  <input
                    className="field"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={t("confirmNewPassword")}
                    type="password"
                    value={confirmPassword}
                  />
                </div>
                <p className="text-xs muted">{t("passwordNote")}</p>
              </div>
            </div>
            <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white" disabled={saving} style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="submit">
              {saving ? t("saving") : t("saveButton")}
            </button>
            {message ? <p className="text-sm" style={{ color: "var(--accent-strong)" }}>{message}</p> : null}
            {error ? <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}
          </div>
        </form>

        <div className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{t("currentDetails")}</p>
          <div className="mt-5 space-y-3">
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("emailLabel")}</p>
              <p className="mt-2 text-base font-bold">{profile?.email ?? t("loading")}</p>
            </div>
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("displayNameLabel")}</p>
              <p className="mt-2 text-base font-bold">{profile?.name ?? t("notSet")}</p>
            </div>
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("profileImageLabel")}</p>
              <p className="mt-2 text-base font-bold">{profile?.image ? t("configured") : t("optional")}</p>
            </div>
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">{t("roleLabel")}</p>
              <p className="mt-2 text-base font-bold">{profile?.role ?? t("loading")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="surface rounded-[2rem] p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">{tb("sectionTitle")}</p>
        <p className="mt-2 text-sm muted">{tb("sectionSubtitle")}</p>
        {badges.length === 0 ? (
          <p className="mt-5 text-sm muted">{tb("empty")}</p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {badges.map((b, i) => {
              const stageName =
                b.stageRoundLabel && KNOWN_ROUNDS.includes(b.stageRoundLabel)
                  ? tb(`rounds.${b.stageRoundLabel}`)
                  : b.stageName ?? "";
              const vars: Record<string, string | number> = {
                stageName,
                groupName: b.groupName ?? "",
                tournamentName: b.tournamentName ?? "",
                ...(b.params ?? {}),
              };
              return (
                <div
                  key={`${b.slug}-${i}`}
                  className="flex items-start gap-3 rounded-[1.3rem] border p-4"
                  style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}
                >
                  <span className="text-2xl leading-none" aria-hidden>{b.icon ?? "🏆"}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{tb(`${b.slug}.name`)}</p>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                      >
                        {tb(`category.${b.category.toLowerCase()}`)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs muted">{tb(`${b.slug}.desc`, vars)}</p>
                    {b.groupName ? <p className="mt-1 text-[11px] muted">{b.groupName}</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
