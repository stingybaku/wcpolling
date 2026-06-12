import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { deadlineReminderEmail } from "@/lib/emails/deadlineReminder";
import { toLocale } from "@/lib/locale";

const HOUR_MS = 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const now = new Date();

  const openStages = await prisma.tournamentStage.findMany({
    where: { status: "OPEN" },
  });

  let sent = 0;

  for (const stage of openStages) {
    const windowMs = stage.closesAt.getTime() - stage.opensAt.getTime();
    const msLeft = stage.closesAt.getTime() - now.getTime();

    const thresholdMs = windowMs >= 48 * HOUR_MS ? 24 * HOUR_MS : 6 * HOUR_MS;
    if (msLeft > thresholdMs || msLeft <= 0) continue;

    const hoursLeft = Math.ceil(msLeft / HOUR_MS);

    const groupsForTournament = await prisma.groupRoom.findMany({
      where: { tournamentId: stage.tournamentId },
      select: { id: true },
    });
    const groupIds = groupsForTournament.map((g) => g.id);

    const activeMembers = await prisma.groupMembership.findMany({
      where: { groupId: { in: groupIds }, isActive: true },
      select: { userId: true },
      distinct: ["userId"],
    });

    const submittedUserIds = await prisma.stagePrediction.findMany({
      where: {
        stageId: stage.id,
        submittedAt: { not: null },
        userId: { in: activeMembers.map((m) => m.userId) },
      },
      select: { userId: true },
    });
    const submittedSet = new Set(submittedUserIds.map((s) => s.userId));

    const alreadyEmailed = await prisma.emailLog.findMany({
      where: {
        type: "DEADLINE_REMINDER",
        refId: stage.id,
        userId: { in: activeMembers.map((m) => m.userId) },
      },
      select: { userId: true },
    });
    const emailedSet = new Set(alreadyEmailed.map((e) => e.userId));

    for (const { userId } of activeMembers) {
      if (submittedSet.has(userId)) continue;
      if (emailedSet.has(userId)) continue;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, locale: true },
      });
      if (!user?.email) continue;

      const baseUrl = process.env.NEXTAUTH_URL ?? '';
      const predictionUrl = `${baseUrl}/staged/${stage.tournamentId}/${stage.id}`;
      const { subject, html } = deadlineReminderEmail(stage.name, stage.closesAt, hoursLeft, predictionUrl, toLocale(user.locale));

      try {
        await sendEmail({ to: user.email, subject, html });
        await prisma.emailLog.create({
          data: {
            userId,
            type: "DEADLINE_REMINDER",
            refId: stage.id,
          },
        });
        sent++;
      } catch {
        // skip on failure; will retry next cron tick if not logged
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { status: 200 });
}
