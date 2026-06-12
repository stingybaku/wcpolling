import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, badRequest } from "@/app/api/helpers";
import { MAX_GROUP_MEMBERS } from "@/lib/group-limits";
import { sendEmail } from "@/lib/email";
import { groupJoinedEmail } from "@/lib/emails/groupJoined";
import { newMemberAlertEmail } from "@/lib/emails/newMemberAlert";
import { toLocale } from "@/lib/locale";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { inviteCode } = await request.json();
  if (!inviteCode || typeof inviteCode !== "string") return badRequest("inviteCode is required");

  const group = await prisma.groupRoom.findUnique({
    where: { inviteCode },
    include: {
      owner: { select: { email: true, locale: true } },
      memberships: {
        where: { isActive: true, role: "GROUP_ADMIN" },
        include: { user: { select: { email: true, locale: true } } },
      },
    },
  });
  if (!group) return badRequest("Invalid invite code");
  if (group.status !== "APPROVED") return badRequest("This group is not open to join yet");

  const existing = await prisma.groupMembership.findUnique({
    where: {
      userId_groupId: {
        userId: user.id,
        groupId: group.id,
      },
    },
  });
  if (existing) return badRequest("You are already a member of this group");

  const currentMembers = await prisma.groupMembership.count({ where: { groupId: group.id } });
  if (currentMembers >= MAX_GROUP_MEMBERS) {
    return badRequest(`This group is full (${MAX_GROUP_MEMBERS} members max)`);
  }

  const membership = await prisma.groupMembership.create({
    data: {
      userId: user.id,
      groupId: group.id,
    },
    include: {
      user: true,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const groupUrl = `${baseUrl}/dashboard/groups/${group.id}`;
  const memberCount = await prisma.groupMembership.count({ where: { groupId: group.id } });
  const joiningUserName = membership.user.name ?? membership.user.email ?? "Someone";

  if (membership.user.email) {
    const { subject, html } = groupJoinedEmail(group.name, groupUrl, toLocale(membership.user.locale));
    sendEmail({ to: membership.user.email, subject, html }).catch(() => null);
  }

  // One alert per unique admin, each in their own language.
  const adminRecipients = new Map<string, string>(); // email -> locale
  if (group.owner.email) adminRecipients.set(group.owner.email, toLocale(group.owner.locale));
  for (const m of group.memberships) {
    if (m.user.email) adminRecipients.set(m.user.email, toLocale(m.user.locale));
  }
  adminRecipients.delete(membership.user.email ?? "");
  for (const [adminEmail, adminLocale] of adminRecipients) {
    const { subject, html } = newMemberAlertEmail(joiningUserName, group.name, memberCount, groupUrl, toLocale(adminLocale));
    sendEmail({ to: adminEmail, subject, html }).catch(() => null);
  }

  return new Response(JSON.stringify({ group, membership }), { status: 200 });
}
