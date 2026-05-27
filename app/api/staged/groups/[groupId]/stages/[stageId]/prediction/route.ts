import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";
import { sendEmail } from "@/lib/email";
import { submissionConfirmEmail } from "@/lib/emails/submissionConfirm";
import { predictionUnlockedEmail } from "@/lib/emails/predictionUnlocked";

type RouteContext = { params: Promise<{ groupId: string; stageId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId, stageId } = await context.params;

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!membership) return forbidden("Not a member of this group");
  if (!membership.isActive) return forbidden("Your access to this group is paused");

  const prediction = await prisma.stagePrediction.findUnique({
    where: { userId_stageId_groupId: { userId: user.id, stageId, groupId } },
  });

  return new Response(JSON.stringify({ prediction }), { status: 200 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId, stageId } = await context.params;

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!membership) return forbidden("Not a member of this group");
  if (!membership.isActive) return forbidden("Your access to this group is paused");

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) return badRequest("Stage not found");
  if (new Date() >= stage.closesAt) return badRequest("This stage is no longer open for predictions");

  const body = await request.json();
  const { submit } = body;

  if (stage.type === "GROUP_QUALIFICATION") {
    const { qualificationPicks } = body as { qualificationPicks?: string[]; submit?: boolean };
    if (!Array.isArray(qualificationPicks)) return badRequest("qualificationPicks must be an array");
    if (submit && qualificationPicks.length !== 32) {
      return badRequest("You must pick exactly 32 teams to submit");
    }

    const prediction = await prisma.stagePrediction.upsert({
      where: { userId_stageId_groupId: { userId: user.id, stageId, groupId } },
      create: {
        userId: user.id,
        stageId,
        groupId,
        qualificationPicks,
        submittedAt: submit ? new Date() : null,
      },
      update: {
        qualificationPicks,
        ...(submit ? { submittedAt: new Date() } : {}),
      },
    });

    if (submit && user.email) {
      const picks = qualificationPicks.slice(0, 10).concat(
        qualificationPicks.length > 10 ? [`...and ${qualificationPicks.length - 10} more`] : []
      );
      const baseUrl = process.env.NEXTAUTH_URL ?? '';
      const predictionUrl = `${baseUrl}/groups/${groupId}`;
      const { subject, html } = submissionConfirmEmail(stage.name, stage.closesAt, picks, predictionUrl);
      sendEmail({ to: user.email, subject, html }).catch(() => null);
    }

    return new Response(JSON.stringify({ prediction }), { status: 200 });
  }

  if (stage.type === "KNOCKOUT") {
    const { matchPicks } = body as { matchPicks?: { matchId: string; winnerId: string }[]; submit?: boolean };
    if (!Array.isArray(matchPicks)) return badRequest("matchPicks must be an array");

    if (submit) {
      const stageMatchCount = await prisma.stageMatch.count({ where: { stageId } });
      if (matchPicks.length < stageMatchCount) {
        return badRequest(`You must pick a winner for all ${stageMatchCount} matches to submit`);
      }
    }

    const prediction = await prisma.stagePrediction.upsert({
      where: { userId_stageId_groupId: { userId: user.id, stageId, groupId } },
      create: {
        userId: user.id,
        stageId,
        groupId,
        matchPicks,
        submittedAt: submit ? new Date() : null,
      },
      update: {
        matchPicks,
        ...(submit ? { submittedAt: new Date() } : {}),
      },
    });

    if (submit && user.email) {
      const picks = matchPicks.map((p) => `Match ${p.matchId}: ${p.winnerId}`);
      const baseUrl = process.env.NEXTAUTH_URL ?? '';
      const predictionUrl = `${baseUrl}/groups/${groupId}`;
      const { subject, html } = submissionConfirmEmail(stage.name, stage.closesAt, picks, predictionUrl);
      sendEmail({ to: user.email, subject, html }).catch(() => null);
    }

    return new Response(JSON.stringify({ prediction }), { status: 200 });
  }

  return badRequest("Unsupported stage type");
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId, stageId } = await context.params;
  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId");
  if (!targetUserId) return badRequest("Missing userId query param");

  const isPortalAdmin = user.role === "ADMIN";
  if (!isPortalAdmin) {
    const callerMembership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId } },
    });
    if (!callerMembership || callerMembership.role !== "GROUP_ADMIN") {
      return forbidden("Only group admins or portal admins can unlock predictions");
    }
  }

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) return badRequest("Stage not found");
  if (new Date() >= stage.closesAt) return badRequest("Stage is no longer open");

  const prediction = await prisma.stagePrediction.update({
    where: { userId_stageId_groupId: { userId: targetUserId, stageId, groupId } },
    data: { submittedAt: null },
  });

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true } });
  if (targetUser?.email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? '';
    const predictionUrl = `${baseUrl}/groups/${groupId}`;
    const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { name: true } });
    const { subject, html } = predictionUnlockedEmail(
      stage.name,
      group?.name ?? groupId,
      stage.closesAt,
      predictionUrl,
    );
    sendEmail({ to: targetUser.email, subject, html }).catch(() => null);
  }

  return new Response(JSON.stringify({ ok: true, prediction }), { status: 200 });
}
