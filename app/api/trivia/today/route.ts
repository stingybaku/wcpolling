import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTournament, getCurrentUser, unauthorized, badRequest } from "@/app/api/helpers";
import {
  awardTriviadorIfEarned,
  getTriviaStats,
  todayUtcDate,
  TRIVIADOR_STREAK,
  TRIVIADOR_SLUG,
} from "@/lib/trivia";

type OptionRow = { key: string; label: Record<string, string> };

// Shape the question for the client. The correct answer is only ever included
// once the user has answered, so the page can't reveal it early.
function publicQuestion(
  q: { id: string; prompt: unknown; options: unknown; points: number },
  answered: boolean,
  correctKey: string
) {
  return {
    id: q.id,
    prompt: q.prompt as Record<string, string>,
    options: (q.options as OptionRow[]).map((o) => ({ key: o.key, label: o.label })),
    points: q.points,
    correctKey: answered ? correctKey : null,
  };
}

async function hasTriviador(userId: string, tournamentId: string): Promise<boolean> {
  const row = await prisma.triviaAchievement.findUnique({
    where: { userId_tournamentId_slug: { userId, tournamentId, slug: TRIVIADOR_SLUG } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const tournament = await getCurrentTournament(request.nextUrl.searchParams.get("tournamentId"));
  if (!tournament) return badRequest("No tournament configured");

  const question = await prisma.triviaQuestion.findUnique({
    where: { tournamentId_publishDate: { tournamentId: tournament.id, publishDate: todayUtcDate() } },
  });

  const answer = question
    ? await prisma.triviaAnswer.findUnique({
        where: { userId_questionId: { userId: user.id, questionId: question.id } },
        select: { answerKey: true, isCorrect: true },
      })
    : null;

  const [stats, earned] = await Promise.all([
    getTriviaStats(user.id, tournament.id),
    hasTriviador(user.id, tournament.id),
  ]);

  return Response.json({
    tournament: { id: tournament.id, name: tournament.name },
    question: question ? publicQuestion(question, Boolean(answer), question.correctKey) : null,
    answer,
    stats,
    triviador: { earned, threshold: TRIVIADOR_STREAK },
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const tournament = await getCurrentTournament(String(body.tournamentId ?? "").trim() || null);
  if (!tournament) return badRequest("No tournament configured");

  const answerKey = String(body.answerKey ?? "").trim();
  if (!answerKey) return badRequest("answerKey is required");

  const question = await prisma.triviaQuestion.findUnique({
    where: { tournamentId_publishDate: { tournamentId: tournament.id, publishDate: todayUtcDate() } },
  });
  if (!question) return badRequest("No trivia question is available today");

  const options = question.options as OptionRow[];
  if (!options.some((o) => o.key === answerKey)) return badRequest("Invalid answer");

  const already = await prisma.triviaAnswer.findUnique({
    where: { userId_questionId: { userId: user.id, questionId: question.id } },
    select: { id: true },
  });
  if (already) return badRequest("You already answered today's question");

  const isCorrect = answerKey === question.correctKey;
  // Unique constraint guards against a double-submit race; surface it cleanly.
  try {
    await prisma.triviaAnswer.create({
      data: { userId: user.id, questionId: question.id, answerKey, isCorrect },
    });
  } catch {
    return badRequest("You already answered today's question");
  }

  const hadBefore = await hasTriviador(user.id, tournament.id);
  const stats = await getTriviaStats(user.id, tournament.id);
  const earned = await awardTriviadorIfEarned(user.id, tournament.id, stats.currentStreak);

  return Response.json({
    isCorrect,
    correctKey: question.correctKey,
    pointsAwarded: isCorrect ? question.points : 0,
    stats,
    triviador: { earned, justEarned: earned && !hadBefore, threshold: TRIVIADOR_STREAK },
  });
}
