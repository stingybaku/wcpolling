"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Link } from "@/lib/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberRole = "MEMBER" | "GROUP_ADMIN";

type Member = {
  id: string;
  userId: string;
  role: MemberRole;
  isActive: boolean;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type Group = {
  id: string;
  name: string;
};

type FeedbackState = {
  type: "success" | "error";
  message: string;
} | null;

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user }: { user: Member["user"] }) {
  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.name ?? ""}
        className="w-9 h-9 rounded-full object-cover"
      />
    );
  }
  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold select-none">
      {initials}
    </div>
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: MemberRole }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        role === "GROUP_ADMIN"
          ? "bg-purple-100 text-purple-700"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      {role === "GROUP_ADMIN" ? "Group Admin" : "Member"}
    </span>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-green-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ─── Member Row ───────────────────────────────────────────────────────────────

function MemberRow({
  member,
  groupId,
  canEdit,
  isSelf,
  onUpdate,
}: {
  member: Member;
  groupId: string;
  canEdit: boolean;
  isSelf: boolean;
  onUpdate: (updated: Member) => void;
}) {
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [activeLoading, setActiveLoading] = useState(false);

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  }

  async function updateMember(payload: { role?: MemberRole; isActive?: boolean }) {
    const res = await fetch(`/api/groups/${groupId}/members/${member.userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Update failed");
    return data.member as Member;
  }

  async function handleRoleChange(newRole: MemberRole) {
    setRoleLoading(true);
    try {
      const updated = await updateMember({ role: newRole });
      onUpdate(updated);
      showFeedback("success", "Role updated");
    } catch (e: unknown) {
      showFeedback("error", e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setRoleLoading(false);
    }
  }

  async function handleActiveToggle(val: boolean) {
    setActiveLoading(true);
    try {
      const updated = await updateMember({ isActive: val });
      onUpdate(updated);
      showFeedback("success", val ? "Member reactivated" : "Member deactivated");
    } catch (e: unknown) {
      showFeedback("error", e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setActiveLoading(false);
    }
  }

  return (
    <tr className={`transition-opacity ${!member.isActive ? "opacity-50" : ""}`}>
      <td className="px-4 py-3">
        <Avatar user={member.user} />
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900">
          {member.user.name ?? "—"}
          {isSelf && <span className="ml-2 text-xs text-blue-500 font-normal">(you)</span>}
        </p>
        <p className="text-xs text-gray-500">{member.user.email ?? "—"}</p>
      </td>
      <td className="px-4 py-3">
        {canEdit && !isSelf && member.role !== "GROUP_ADMIN" ? (
          <select
            value={member.role}
            disabled={roleLoading}
            onChange={(e) => handleRoleChange(e.target.value as MemberRole)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="MEMBER">Member</option>
            <option value="GROUP_ADMIN">Group Admin</option>
          </select>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </td>
      <td className="px-4 py-3">
        {canEdit && !isSelf ? (
          <Toggle
            checked={member.isActive}
            onChange={handleActiveToggle}
            disabled={activeLoading}
          />
        ) : (
          <span className={`inline-block w-2 h-2 rounded-full ${member.isActive ? "bg-green-500" : "bg-gray-300"}`} />
        )}
      </td>
      <td className="px-4 py-3">
        {feedback && (
          <span
            className={`text-xs font-medium ${
              feedback.type === "success" ? "text-green-600" : "text-red-600"
            }`}
          >
            {feedback.message}
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { data: session } = useSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [membersRes, groupRes] = await Promise.all([
          fetch(`/api/groups/${groupId}/members`),
          fetch(`/api/groups/${groupId}`),
        ]);
        const [membersData, groupData] = await Promise.all([
          membersRes.json(),
          groupRes.json(),
        ]);
        if (!membersRes.ok) throw new Error(membersData.error ?? "Failed to load members");
        if (!groupRes.ok) throw new Error(groupData.error ?? "Failed to load group");
        setMembers(membersData.members ?? []);
        setGroup(groupData.group ?? null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [groupId]);

  const currentUserId = session?.user?.id ?? "";
  const isPortalAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  const myMembership = members.find((m) => m.userId === currentUserId);
  const canEdit = isPortalAdmin || myMembership?.role === "GROUP_ADMIN";

  function handleUpdate(updated: Member) {
    setMembers((prev) => prev.map((m) => (m.userId === updated.userId ? updated : m)));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={`/dashboard/groups/${groupId}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to group
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">
            {group?.name ? `${group.name} — Members` : "Members"}
          </h1>
          {canEdit && (
            <p className="text-sm text-gray-500 mt-1">Manage member roles and access.</p>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-200">
                  <th className="px-4 py-3 text-left w-12"></th>
                  <th className="px-4 py-3 text-left">Name / Email</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Active</th>
                  <th className="px-4 py-3 text-left w-36"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    groupId={groupId}
                    canEdit={canEdit}
                    isSelf={member.userId === currentUserId}
                    onUpdate={handleUpdate}
                  />
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                      No members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400">
          {members.length} member{members.length !== 1 ? "s" : ""}
          {members.filter((m) => !m.isActive).length > 0
            ? ` · ${members.filter((m) => !m.isActive).length} inactive`
            : ""}
        </p>
      </div>
    </div>
  );
}
