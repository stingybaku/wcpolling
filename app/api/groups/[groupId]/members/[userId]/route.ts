import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";
import { sendEmail } from "@/lib/email";
import { markedInactiveEmail } from "@/lib/emails/markedInactive";
import { reactivatedEmail } from "@/lib/emails/reactivated";
import { promotedToAdminEmail } from "@/lib/emails/promotedToAdmin";
import { toLocale } from "@/lib/locale";
import { GroupMemberRole } from "@prisma/client";

type RouteContext = { params: Promise<{ groupId: string; userId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const caller = await getCurrentUser();
  if (!caller) return unauthorized();

  const { groupId, userId: targetUserId } = await context.params;

  const isPortalAdmin = caller.role === "ADMIN";
  const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { ownerId: true } });
  const isGroupOwner = group?.ownerId === caller.id;

  if (!isPortalAdmin) {
    const callerMembership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: caller.id, groupId } },
    });
    if (!isGroupOwner && (!callerMembership || callerMembership.role !== "GROUP_ADMIN")) {
      return forbidden("Only group admins or portal admins can update members");
    }
  }

  if (caller.id === targetUserId) {
    return badRequest("You cannot change your own role");
  }

  const body = await request.json() as { role?: string; isActive?: boolean };

  const targetMembership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: targetUserId, groupId } },
    include: { user: { select: { email: true, name: true, locale: true } } },
  });
  if (!targetMembership) return badRequest("User is not a member of this group");

  if (body.role === "MEMBER" && targetMembership.role === "GROUP_ADMIN" && !isGroupOwner && !isPortalAdmin) {
    return forbidden("Only the group owner can demote admins");
  }

  const updateData: { role?: GroupMemberRole; isActive?: boolean } = {};
  if (body.role !== undefined && (body.role === "MEMBER" || body.role === "GROUP_ADMIN")) {
    updateData.role = body.role as GroupMemberRole;
    if (body.role === "GROUP_ADMIN") updateData.isActive = true;
  }
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const member = await prisma.groupMembership.update({
    where: { userId_groupId: { userId: targetUserId, groupId } },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true, image: true, role: true, locale: true } },
    },
  });

  const targetEmail = targetMembership.user.email;
  const targetLocale = toLocale(targetMembership.user.locale);
  const baseUrl = process.env.NEXTAUTH_URL ?? '';

  if (targetEmail && body.isActive !== undefined && body.isActive !== targetMembership.isActive) {
    if (body.isActive === false) {
      const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { name: true } });
      const emailContent = markedInactiveEmail(group?.name ?? groupId, targetLocale);
      sendEmail({ to: targetEmail, subject: emailContent.subject, html: emailContent.html }).catch(() => null);
    } else {
      const predictionUrl = `${baseUrl}/groups/${groupId}`;
      const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { name: true } });
      const { subject, html } = reactivatedEmail(group?.name ?? groupId, predictionUrl, targetLocale);
      sendEmail({ to: targetEmail, subject, html }).catch(() => null);
    }
  }

  if (targetEmail && body.role === "GROUP_ADMIN" && body.role !== targetMembership.role) {
    const membersUrl = `${baseUrl}/groups/${groupId}/members`;
    const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { name: true } });
    const { subject, html } = promotedToAdminEmail(group?.name ?? groupId, membersUrl, targetLocale);
    sendEmail({ to: targetEmail, subject, html }).catch(() => null);
  }

  return new Response(JSON.stringify({ member }), { status: 200 });
}
