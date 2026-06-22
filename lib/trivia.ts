import { prisma } from "@/lib/prisma";

// Consecutive correct daily answers required to earn the global "Triviador"
// achievement, and its slug (the i18n key for the user-facing name/desc).
export const TRIVIADOR_STREAK = 5;
export const TRIVIADOR_SLUG = "triviador";

/** Bilingual text blob stored on questions/options: { en, es }. */
export type Localized = Record<string, string>;

export type TriviaOption = { key: string; label: Localized };

/** Pick the caller's locale from a localized blob, falling back to en/first. */
export function pickLocale(value: Localized, locale: string): string {
  return value[locale] ?? value.en ?? Object.values(value)[0] ?? "";
}

type QuestionForStats = { id: string; points: number };
type AnswerForStats = { questionId: string; isCorrect: boolean };

export type TriviaStats = {
  totalPoints: number;
  answeredCount: number;
  correctCount: number;
  currentStreak: number;
};

/**
 * Pure streak/points computation, kept separate from the DB so it is easy to
 * reason about and test.
 *
 * `questions` MUST be ordered by publishDate ascending. The current streak walks
 * the question sequence up to the most recent one the user has answered:
 *   - a correct answer extends the run,
 *   - a wrong answer OR a skipped (unanswered) past day resets it to 0.
 * Trailing unanswered questions (e.g. today's, before it's answered) are ignored
 * so the displayed streak reflects yesterday's run until today is played. A day
 * with no published question simply isn't in the sequence and can't break a run.
 */
export function computeTriviaStats(
  questions: QuestionForStats[],
  answers: AnswerForStats[]
): TriviaStats {
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

  let totalPoints = 0;
  let correctCount = 0;
  for (const q of questions) {
    const a = answerByQuestion.get(q.id);
    if (a?.isCorrect) {
      correctCount += 1;
      totalPoints += q.points;
    }
  }

  // Index of the last question the user has answered (correct or not); the
  // streak is only meaningful up to there.
  let lastAnsweredIdx = -1;
  for (let i = questions.length - 1; i >= 0; i--) {
    if (answerByQuestion.has(questions[i].id)) {
      lastAnsweredIdx = i;
      break;
    }
  }

  let currentStreak = 0;
  for (let i = 0; i <= lastAnsweredIdx; i++) {
    const a = answerByQuestion.get(questions[i].id);
    currentStreak = a?.isCorrect ? currentStreak + 1 : 0;
  }

  return { totalPoints, answeredCount: answerByQuestion.size, correctCount, currentStreak };
}

/** Load a user's trivia stats for one tournament. */
export async function getTriviaStats(userId: string, tournamentId: string): Promise<TriviaStats> {
  const [questions, answers] = await Promise.all([
    prisma.triviaQuestion.findMany({
      where: { tournamentId },
      orderBy: { publishDate: "asc" },
      select: { id: true, points: true },
    }),
    prisma.triviaAnswer.findMany({
      where: { userId, question: { tournamentId } },
      select: { questionId: true, isCorrect: true },
    }),
  ]);
  return computeTriviaStats(questions, answers);
}

/**
 * Idempotently grant Triviador once the user's current streak reaches the
 * threshold. Returns true if the achievement is now held (newly or already).
 */
export async function awardTriviadorIfEarned(
  userId: string,
  tournamentId: string,
  currentStreak: number
): Promise<boolean> {
  if (currentStreak < TRIVIADOR_STREAK) {
    const existing = await prisma.triviaAchievement.findUnique({
      where: { userId_tournamentId_slug: { userId, tournamentId, slug: TRIVIADOR_SLUG } },
      select: { id: true },
    });
    return Boolean(existing);
  }
  await prisma.triviaAchievement.upsert({
    where: { userId_tournamentId_slug: { userId, tournamentId, slug: TRIVIADOR_SLUG } },
    create: { userId, tournamentId, slug: TRIVIADOR_SLUG, streakLength: currentStreak },
    update: {},
  });
  return true;
}

/** UTC date-only floor — matches the @db.Date column used for publishDate. */
export function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
