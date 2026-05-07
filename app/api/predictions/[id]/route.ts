import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { recalculateSubmissionByPrediction } from "@/lib/scoring";
import { populatePredictionR32Bracket } from "@/lib/prediction-bracket";

type PredictionEntryData = {
  matchId: string;
  predictedHomeTeamId?: string | null;
  predictedAwayTeamId?: string | null;
  predictedHomeScore?: number | null;
  predictedAwayScore?: number | null;
};

type StandingData = {
  groupId: string;
  teamId: string;
  position: number;
};

type TieBreakerData = {
  questionId: string;
  answer: string;
};

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await context.params;
  if (!id) return badRequest("Missing prediction id");

  const prediction = await prisma.prediction.findUnique({
    where: { id },
    include: {
      submissions: true,
    },
  });

  if (!prediction || prediction.userId !== user.id) {
    return forbidden("Prediction not found");
  }

  const body = await request.json();
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const entries = Array.isArray(body.entries) ? (body.entries as PredictionEntryData[]) : [];
  const groupStandings = Array.isArray(body.groupStandings) ? (body.groupStandings as StandingData[]) : [];
  const tieBreakerAnswers = Array.isArray(body.tieBreakerAnswers) ? (body.tieBreakerAnswers as TieBreakerData[]) : [];

  if (!name) return badRequest("Prediction name is required");

  const updatedPrediction = await prisma.prediction.update({
    where: { id },
    data: {
      name,
      description,
      entries: {
        deleteMany: {},
        create: entries.map((entry) => ({
          matchId: String(entry.matchId),
          predictedHomeTeamId: entry.predictedHomeTeamId ? String(entry.predictedHomeTeamId) : null,
          predictedAwayTeamId: entry.predictedAwayTeamId ? String(entry.predictedAwayTeamId) : null,
          predictedHomeScore: entry.predictedHomeScore == null ? null : Number(entry.predictedHomeScore),
          predictedAwayScore: entry.predictedAwayScore == null ? null : Number(entry.predictedAwayScore),
        })),
      },
      groupStandings: {
        deleteMany: {},
        create: groupStandings
          .filter((standing) => String(standing.teamId ?? "").trim())
          .map((standing) => ({
            groupId: String(standing.groupId),
            teamId: String(standing.teamId),
            position: Number(standing.position),
          })),
      },
      tieBreakerAnswers: {
        deleteMany: {},
        create: tieBreakerAnswers
          .filter((answer) => String(answer.answer ?? "").trim())
          .map((answer) => ({
            questionId: String(answer.questionId),
            answer: String(answer.answer),
          })),
      },
    },
    include: {
      entries: true,
      groupStandings: true,
      tieBreakerAnswers: true,
      submissions: true,
    },
  });

  if (prediction.submissions.length > 0) {
    await recalculateSubmissionByPrediction(prediction.id);
  }

  if (!body.skipBracketPopulation) {
    populatePredictionR32Bracket(prediction.id).catch(() => {});
  }

  return new Response(JSON.stringify({ prediction: updatedPrediction }), { status: 200 });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await context.params;
  if (!id) return badRequest("Missing prediction id");

  const prediction = await prisma.prediction.findUnique({ where: { id }, include: { submissions: true } });
  if (!prediction || prediction.userId !== user.id) return forbidden("Prediction not found");

  if (prediction.submissions.length > 0) {
    return new Response(JSON.stringify({ error: "Cannot delete a prediction that has been submitted to a group." }), { status: 409 });
  }

  await prisma.prediction.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
