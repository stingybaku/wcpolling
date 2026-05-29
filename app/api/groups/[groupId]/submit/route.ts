import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, badRequest, forbidden } from "@/app/api/helpers";
import { recalculateTournamentScores } from "@/lib/scoring";
import { sendEmail } from "@/lib/email";
import { submissionConfirmEmail } from "@/lib/emails/submissionConfirm";

async function resolveGroupAndCheckDeadline(groupId: string): Promise<{ error: string; tournamentId?: never } | { tournamentId: string; error?: never }> {
  const group = await prisma.groupRoom.findUnique({
    where: { id: groupId },
    select: {
      tournamentId: true,
      tournament: { select: { submissionDeadline: true } },
    },
  });
  if (!group) return { error: "Group not found" };
  if (!group.tournamentId) return { error: "This group is not linked to a tournament yet" };
  if (group.tournament?.submissionDeadline && new Date() > group.tournament.submissionDeadline) {
    return { error: "The submission deadline has passed" };
  }
  return { tournamentId: group.tournamentId };
}

export async function POST(request: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { groupId } = await context.params;
  if (!groupId) return badRequest("Missing group id");

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!membership) return forbidden("Must be a group member to submit prediction");
  if (!membership.isActive) return forbidden("Your access to this group is paused");

  const existingSubmission = await prisma.predictionSubmission.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (existingSubmission) return badRequest("You have already submitted a prediction for this group");

  const resolved = await resolveGroupAndCheckDeadline(groupId);
  if (resolved.error) return badRequest(resolved.error);
  const tournamentId = resolved.tournamentId!;

  const body = await request.json().catch(() => ({}));
  const bodyPredictionId = String(body.predictionId ?? "").trim();

  let predictionId: string;
  let predictionName: string;
  if (bodyPredictionId) {
    const prediction = await prisma.prediction.findUnique({ where: { id: bodyPredictionId } });
    if (!prediction || prediction.userId !== user.id) return forbidden("Prediction not found");
    if (prediction.tournamentId !== tournamentId) return badRequest("Prediction does not belong to this tournament");
    predictionId = prediction.id;
    predictionName = prediction.name;
  } else {
    const selected = await prisma.prediction.findFirst({
      where: { userId: user.id, selected: true, tournamentId },
    });
    if (!selected) return badRequest("No prediction selected. Please choose a prediction to submit.");
    predictionId = selected.id;
    predictionName = selected.name;
  }

  const submission = await prisma.predictionSubmission.create({
    data: {
      userId: user.id,
      groupId,
      predictionId,
    },
  });

  await recalculateTournamentScores(tournamentId);

  if (user.email) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, submissionDeadline: true },
    });
    if (tournament) {
      const baseUrl = process.env.NEXTAUTH_URL ?? "";
      const { subject, html } = submissionConfirmEmail(
        tournament.name,
        tournament.submissionDeadline ?? new Date(),
        [predictionName],
        `${baseUrl}/dashboard/groups/${groupId}`,
      );
      sendEmail({ to: user.email, subject, html }).catch(() => null);
    }
  }

  return new Response(JSON.stringify({ submissionId: submission.id }), { status: 201 });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { groupId } = await context.params;
  if (!groupId) return badRequest("Missing group id");

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!membership) return forbidden("Must be a group member to update submission");

  const existingSubmission = await prisma.predictionSubmission.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!existingSubmission) return badRequest("No submission found. Submit a prediction first.");

  const resolved = await resolveGroupAndCheckDeadline(groupId);
  if (resolved.error) return badRequest(resolved.error);
  const tournamentId = resolved.tournamentId!;

  const body = await request.json().catch(() => ({}));
  const predictionId = String(body.predictionId ?? "").trim();
  if (!predictionId) return badRequest("predictionId is required");

  const prediction = await prisma.prediction.findUnique({ where: { id: predictionId } });
  if (!prediction || prediction.userId !== user.id) return forbidden("Prediction not found");
  if (prediction.tournamentId !== tournamentId) return badRequest("Prediction does not belong to this tournament");

  await prisma.predictionSubmission.update({
    where: { id: existingSubmission.id },
    data: { predictionId },
  });

  await recalculateTournamentScores(tournamentId);

  return new Response(JSON.stringify({ message: "Submission updated" }), { status: 200 });
}
