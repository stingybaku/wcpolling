import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";
import { sendEmail } from "@/lib/email";
import { predictionUnlockedEmail } from "@/lib/emails/predictionUnlocked";
import { groupQualificationConfirmEmail, knockoutConfirmEmail } from "@/lib/emails/stagePredictionConfirm";
import { toLocale } from "@/lib/locale";
import { scoreStage } from "@/lib/stage-scoring";
import { UNLOCKS_PER_STAGE } from "@/lib/staged-unlocks";

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

  const [prediction, score] = await Promise.all([
    prisma.stagePrediction.findUnique({
      where: { userId_stageId_groupId: { userId: user.id, stageId, groupId } },
    }),
    prisma.stageScore.findUnique({
      where: { userId_stageId_groupId: { userId: user.id, stageId, groupId } },
      select: { points: true, correctPicks: true },
    }),
  ]);

  return new Response(JSON.stringify({ prediction, score }), { status: 200 });
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
      const baseUrl = process.env.NEXTAUTH_URL ?? '';
      const predictionUrl = `${baseUrl}/dashboard/groups/${groupId}`;
      const [tournament, pickedTeams] = await Promise.all([
        prisma.tournament.findUnique({ where: { id: stage.tournamentId }, select: { name: true } }),
        prisma.team.findMany({
          where: { id: { in: qualificationPicks } },
          select: {
            id: true,
            name: true,
            groupMemberships: {
              where: { group: { tournamentId: stage.tournamentId } },
              select: { group: { select: { name: true, sortOrder: true } } },
            },
          },
        }),
      ]);
      const groupMap = new Map<string, { sortOrder: number; teams: string[] }>();
      const ungrouped: string[] = [];
      for (const team of pickedTeams) {
        const gm = team.groupMemberships[0];
        if (gm) {
          const key = gm.group.name;
          if (!groupMap.has(key)) groupMap.set(key, { sortOrder: gm.group.sortOrder, teams: [] });
          groupMap.get(key)!.teams.push(team.name);
        } else {
          ungrouped.push(team.name);
        }
      }
      const groupPickData = [...groupMap.entries()]
        .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
        .map(([groupName, { teams }]) => ({ groupName, teams }));
      if (ungrouped.length > 0) groupPickData.push({ groupName: "Other", teams: ungrouped });

      const { subject, html } = groupQualificationConfirmEmail(
        stage.name,
        tournament?.name ?? "",
        stage.closesAt,
        groupPickData,
        predictionUrl,
        toLocale(user.locale),
      );
      sendEmail({ to: user.email, subject, html }).catch(() => null);
    }

    if (submit) {
      const hasResults = await prisma.stageQualificationResult.findUnique({ where: { stageId } });
      if (hasResults) scoreStage(stageId).catch(() => null);
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
      const baseUrl = process.env.NEXTAUTH_URL ?? '';
      const predictionUrl = `${baseUrl}/dashboard/groups/${groupId}`;
      const tournament = await prisma.tournament.findUnique({
        where: { id: stage.tournamentId },
        select: { name: true },
      });
      const stageMatchData = await prisma.stageMatch.findMany({
        where: { stageId },
        include: { homeTeam: { select: { id: true, name: true } }, awayTeam: { select: { id: true, name: true } } },
        orderBy: { matchNumber: "asc" },
      });
      const matchMap = Object.fromEntries(stageMatchData.map((m) => [m.id, m]));
      const emailMatches = matchPicks.flatMap((p) => {
        const m = matchMap[p.matchId];
        if (!m) return [];
        const pickedName = m.homeTeamId === p.winnerId ? m.homeTeam.name : m.awayTeam.name;
        return [{ matchNumber: m.matchNumber, home: m.homeTeam.name, away: m.awayTeam.name, picked: pickedName }];
      });
      const { subject, html } = knockoutConfirmEmail(
        stage.name,
        tournament?.name ?? "",
        stage.closesAt,
        emailMatches,
        predictionUrl,
        toLocale(user.locale),
      );
      sendEmail({ to: user.email, subject, html }).catch(() => null);
    }

    if (submit) {
      const hasResults = await prisma.stageMatch.count({ where: { stageId, winnerId: { not: null } } });
      if (hasResults > 0) scoreStage(stageId).catch(() => null);
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
    const group = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { ownerId: true } });
    const isGroupOwner = group?.ownerId === user.id;
    if (!isGroupOwner) {
      const callerMembership = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: user.id, groupId } },
      });
      if (!callerMembership || callerMembership.role !== "GROUP_ADMIN") {
        return forbidden("Only group admins or portal admins can unlock predictions");
      }
    }
  }

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) return badRequest("Stage not found");
  if (new Date() >= stage.closesAt) return badRequest("Stage is no longer open");

  const halfwayMs = (stage.closesAt.getTime() - stage.opensAt.getTime()) / 2;
  if (Date.now() - stage.opensAt.getTime() > halfwayMs) {
    return new Response(
      JSON.stringify({ error: "Predictions can only be unlocked in the first half of the stage window" }),
      { status: 409 }
    );
  }

  const existing = await prisma.stagePrediction.findUnique({
    where: { userId_stageId_groupId: { userId: targetUserId, stageId, groupId } },
  });
  if (!existing) return badRequest("No prediction found for this user");
  if (existing.submittedAt === null) return badRequest("This prediction is not locked");
  if (existing.unlockCount >= UNLOCKS_PER_STAGE) {
    return new Response(
      JSON.stringify({ error: "No unlocks remaining for this member in this phase" }),
      { status: 409 }
    );
  }

  // For KNOCKOUT: snapshot already-decided match IDs so they're excluded from
  // scoring. Accumulate across unlocks so matches decided in an earlier unlock
  // stay locked out.
  let lockedOutMatchIds: string[] = Array.isArray(existing.lockedOutMatchIds)
    ? (existing.lockedOutMatchIds as string[])
    : [];
  if (stage.type === "KNOCKOUT") {
    const decidedMatches = await prisma.stageMatch.findMany({
      where: { stageId, winnerId: { not: null } },
      select: { id: true },
    });
    lockedOutMatchIds = Array.from(new Set([...lockedOutMatchIds, ...decidedMatches.map((m) => m.id)]));
  }

  const prediction = await prisma.stagePrediction.update({
    where: { userId_stageId_groupId: { userId: targetUserId, stageId, groupId } },
    data: {
      submittedAt: null,
      unlockedAt: new Date(),
      unlockCount: { increment: 1 },
      lockedOutMatchIds: lockedOutMatchIds.length > 0 ? lockedOutMatchIds : undefined,
    },
  });

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true, locale: true } });
  if (targetUser?.email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? '';
    const predictionUrl = `${baseUrl}/dashboard/groups/${groupId}`;
    const groupData = await prisma.groupRoom.findUnique({ where: { id: groupId }, select: { name: true } });
    const { subject, html } = predictionUnlockedEmail(
      stage.name,
      groupData?.name ?? groupId,
      stage.closesAt,
      predictionUrl,
      toLocale(targetUser.locale),
    );
    sendEmail({ to: targetUser.email, subject, html }).catch(() => null);
  }

  return new Response(JSON.stringify({ ok: true, prediction }), { status: 200 });
}
