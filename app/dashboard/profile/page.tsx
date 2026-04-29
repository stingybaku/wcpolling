"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Profile = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  image?: string | null;
};

export default function DashboardProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
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
        setError("Could not load your profile.");
        return;
      }

      const data = await res.json();
      setProfile(data.profile);
      setName(data.profile?.name ?? "");
    }

    void loadProfile();
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    if (newPassword && newPassword !== confirmPassword) {
      setSaving(false);
      setError("New password and confirmation do not match.");
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
      setError(data?.error ?? "Could not update profile.");
      return;
    }

    const data = await res.json();
    setProfile(data.profile);
    setName(data.profile?.name ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage(newPassword ? "Profile and password updated." : "Profile updated.");
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
      setError(data?.error ?? "Could not upload avatar.");
      return;
    }

    const data = await res.json();
    setProfile(data.profile);
    setMessage("Profile photo updated.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="hero-surface rounded-[2rem] border px-5 py-6 md:px-8 md:py-8" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.34em]" style={{ color: "var(--accent-strong)" }}>Profile</p>
        <h2 className="display-title mt-3 text-5xl leading-none md:text-7xl">Your account card.</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 muted">Review your account details, update the display name, and keep your identity clean across groups and leaderboards.</p>
      </section>

      <section className="content-grid">
        <form onSubmit={saveProfile} className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Edit profile</p>
          <div className="mt-5 space-y-4">
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
              <p className="text-sm font-semibold">Profile photo</p>
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
                    <span>{uploading ? "Uploading..." : "Upload image"}</span>
                    <input accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={uploadAvatar} type="file" />
                  </label>
                  <p className="text-xs muted">Optional. JPG, PNG, or WEBP up to 2MB. Google/Facebook sign-in uses the provider photo automatically.</p>
                </div>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Display name</label>
              <input className="field" onChange={(event) => setName(event.target.value)} placeholder="Your name" value={name} />
            </div>
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-strong)" }}>
              <p className="text-sm font-semibold">Change password</p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-semibold">Current password</label>
                  <input
                    className="field"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Current password"
                    type="password"
                    value={currentPassword}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">New password</label>
                  <input
                    className="field"
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password"
                    type="password"
                    value={newPassword}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Confirm new password</label>
                  <input
                    className="field"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirm new password"
                    type="password"
                    value={confirmPassword}
                  />
                </div>
                <p className="text-xs muted">Leave the password fields empty if you only want to update your profile details.</p>
              </div>
            </div>
            <button className="rounded-[1.3rem] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white" disabled={saving} style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} type="submit">
              {saving ? "Saving..." : "Save profile"}
            </button>
            {message ? <p className="text-sm" style={{ color: "var(--accent-strong)" }}>{message}</p> : null}
            {error ? <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}
          </div>
        </form>

        <div className="surface rounded-[2rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] muted">Current details</p>
          <div className="mt-5 space-y-3">
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">Email</p>
              <p className="mt-2 text-base font-bold">{profile?.email ?? "Loading..."}</p>
            </div>
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">Display name</p>
              <p className="mt-2 text-base font-bold">{profile?.name ?? "Not set"}</p>
            </div>
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">Profile image</p>
              <p className="mt-2 text-base font-bold">{profile?.image ? "Configured" : "Optional"}</p>
            </div>
            <div className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] muted">Role</p>
              <p className="mt-2 text-base font-bold">{profile?.role ?? "Loading..."}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
