import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";

type RouteContext = { params: Promise<{ groupId: string; stageId: string }> };

/**
 * Verify the caller may manage this group: portal admin (role ADMIN) bypasses;
 * otherwise the group owner or a GROUP_ADMIN member. Mirrors the unlock flow.
 */
async function requireGroupAdmin(userId: string, userRole: string, groupId: string): Promise<boolean> {
  if (userRole === "ADMIN") return true;
  const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { ownerId: true } });
  if (group?.ownerId === userId) return true;
  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  return membership?.role === "GROUP_ADMIN";
}

/**
 * Grant a member a one-time allowance to submit a MISSING prediction for this
 * stage after the deadline. Only valid for members who have not submitted —
 * editing an existing submission is handled by the unlock flow.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId, stageId } = await context.params;
  const targetUserId = new URL(request.url).searchParams.get("userId");
  if (!targetUserId) return badRequest("Missing userId query param");

  if (!(await requireGroupAdmin(user.id, user.role, groupId))) {
    return forbidden("Only group admins or portal admins can allow late submissions");
  }

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId }, select: { id: true, type: true } });
  if (!stage) return badRequest("Stage not found");

  // Optional penalty: matches the late submitter may not pick. KNOCKOUT only.
  const body = await request.json().catch(() => ({}));
  const lockedMatchIds: string[] = Array.isArray(body.lockedMatchIds)
    ? [...new Set<string>(body.lockedMatchIds.map(String))]
    : [];
  if (lockedMatchIds.length > 0) {
    if (stage.type !== "KNOCKOUT") {
      return badRequest("Locked matches only apply to knockout stages");
    }
    const validCount = await prisma.stageMatch.count({
      where: { id: { in: lockedMatchIds }, stageId },
    });
    if (validCount !== lockedMatchIds.length) {
      return badRequest("One or more locked matches do not belong to this stage");
    }
  }

  const targetMembership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: targetUserId, groupId } },
  });
  if (!targetMembership) return badRequest("User is not a member of this group");
  if (!targetMembership.isActive) return badRequest("Reactivate this member before allowing a late submission");

  const existing = await prisma.stagePrediction.findUnique({
    where: { userId_stageId_groupId: { userId: targetUserId, stageId, groupId } },
    select: { submittedAt: true },
  });
  if (existing?.submittedAt) {
    return badRequest("This member already submitted — use unlock to let them edit instead");
  }

  const grace = await prisma.stageSubmissionGrace.upsert({
    where: { userId_stageId_groupId: { userId: targetUserId, stageId, groupId } },
    create: { userId: targetUserId, stageId, groupId, grantedById: user.id, lockedMatchIds },
    update: { grantedById: user.id, grantedAt: new Date(), usedAt: null, lockedMatchIds },
  });

  return new Response(JSON.stringify({ ok: true, grace }), { status: 200 });
}

/** Revoke a not-yet-used late-submission allowance. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId, stageId } = await context.params;
  const targetUserId = new URL(request.url).searchParams.get("userId");
  if (!targetUserId) return badRequest("Missing userId query param");

  if (!(await requireGroupAdmin(user.id, user.role, groupId))) {
    return forbidden("Only group admins or portal admins can revoke late submissions");
  }

  await prisma.stageSubmissionGrace.deleteMany({
    where: { userId: targetUserId, stageId, groupId },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
