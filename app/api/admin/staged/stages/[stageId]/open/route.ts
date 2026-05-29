import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { stageOpenEmail } from "@/lib/emails/stageOpen";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(_request: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;

  const stage = await prisma.tournamentStage.findUnique({
    where: { id: stageId },
  });
  if (!stage) {
    return new Response(JSON.stringify({ error: "Stage not found" }), { status: 404 });
  }

  if (stage.status !== "UPCOMING") {
    return new Response(
      JSON.stringify({ error: "Stage must be UPCOMING to transition to OPEN" }),
      { status: 409 }
    );
  }

  if (stage.closesAt <= new Date()) {
    return new Response(
      JSON.stringify({ error: "closesAt must be in the future to open the stage" }),
      { status: 409 }
    );
  }

  if (stage.type === "KNOCKOUT") {
    const matchCount = await prisma.stageMatch.count({ where: { stageId } });
    if (matchCount === 0) {
      return new Response(
        JSON.stringify({ error: "KNOCKOUT stage must have at least one match entered before opening" }),
        { status: 409 }
      );
    }
  }

  if (stage.order > 1) {
    const previousStage = await prisma.tournamentStage.findFirst({
      where: {
        tournamentId: stage.tournamentId,
        order: stage.order - 1,
      },
    });
    if (!previousStage || previousStage.status !== "SCORED") {
      return new Response(
        JSON.stringify({ error: "Previous stage must be SCORED before opening this stage" }),
        { status: 409 }
      );
    }
  }

  const updated = await prisma.tournamentStage.update({
    where: { id: stageId },
    data: { status: "OPEN" },
  });

  // Notify all active group members — one email per unique user
  const tournament = await prisma.tournament.findUnique({
    where: { id: stage.tournamentId },
    select: { name: true },
  });
  const groups = await prisma.groupRoom.findMany({
    where: { tournamentId: stage.tournamentId },
    include: {
      memberships: {
        where: { isActive: true },
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });
  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const isShortWindow = (stage.closesAt.getTime() - Date.now()) < 48 * 60 * 60 * 1000;
  const seenEmails = new Set<string>();
  for (const group of groups) {
    for (const m of group.memberships) {
      if (!m.user.email || seenEmails.has(m.user.email)) continue;
      seenEmails.add(m.user.email);
      const predictionUrl = `${baseUrl}/dashboard/groups/${group.id}/predictions/${stage.tournamentId}`;
      const { subject, html } = stageOpenEmail(stage.name, tournament!.name, stage.closesAt, predictionUrl, isShortWindow);
      sendEmail({ to: m.user.email, subject, html }).catch(() => null);
    }
  }

  return new Response(JSON.stringify({ stage: updated }), { status: 200 });
}
