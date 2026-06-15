import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";
import { normalizeAnswer } from "@/lib/tiebreaker";

type RouteContext = { params: Promise<{ tournamentId: string }> };

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { tournamentId } = await context.params;

  const [questions, answers] = await Promise.all([
    prisma.tieBreakerQuestion.findMany({
      where: { tournamentId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.stageTieBreakerAnswer.findMany({
      where: { tournamentId },
      select: { questionId: true, answer: true },
    }),
  ]);

  // For each question, group submitted answers by normalized key (across all
  // groups in the tournament) so the admin can grade them manually. Within a
  // group, the most frequently typed raw spelling becomes the display label.
  const grouped = new Map<string, Map<string, Map<string, number>>>();
  for (const a of answers) {
    const raw = a.answer.trim();
    if (!raw) continue;
    const key = normalizeAnswer(raw);
    if (!key) continue;
    let byKey = grouped.get(a.questionId);
    if (!byKey) { byKey = new Map(); grouped.set(a.questionId, byKey); }
    let rawCounts = byKey.get(key);
    if (!rawCounts) { rawCounts = new Map(); byKey.set(key, rawCounts); }
    rawCounts.set(raw, (rawCounts.get(raw) ?? 0) + 1);
  }

  const submissions: Record<string, { key: string; label: string; count: number }[]> = {};
  for (const [questionId, byKey] of grouped) {
    submissions[questionId] = Array.from(byKey.entries())
      .map(([key, rawCounts]) => {
        let label = key;
        let labelCount = -1;
        let count = 0;
        for (const [raw, c] of rawCounts) {
          count += c;
          if (c > labelCount) { labelCount = c; label = raw; }
        }
        return { key, label, count };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  return new Response(JSON.stringify({ questions, submissions }), { status: 200 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { tournamentId } = await context.params;

  const body = await request.json();
  const { prompt, type } = body as { prompt: { en: string; es: string }; type: "NUMBER" | "TEXT" };

  if (!prompt?.en || !type) return badRequest("prompt.en and type are required");
  if (type !== "NUMBER" && type !== "TEXT") return badRequest("type must be NUMBER or TEXT");

  const maxOrder = await prisma.tieBreakerQuestion.aggregate({
    where: { tournamentId },
    _max: { sortOrder: true },
  });

  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  const question = await prisma.tieBreakerQuestion.create({
    data: {
      tournamentId,
      prompt,
      type,
      sortOrder,
    },
  });

  return new Response(JSON.stringify({ question }), { status: 201 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { tournamentId } = await context.params;

  const body = await request.json();
  const { questionId, correctAnswer, acceptedAnswers, metric } = body as {
    questionId: string;
    correctAnswer?: string | null;
    acceptedAnswers?: string[];
    metric?: string | null;
  };

  if (!questionId) return badRequest("questionId is required");

  const VALID_METRICS = ["TOTAL_GOALS", "FINAL_GOALS", "PENALTY_SHOOTOUTS", "RED_CARDS"];
  const data: {
    correctAnswer?: string | null;
    acceptedAnswers?: string[];
    metric?: "TOTAL_GOALS" | "FINAL_GOALS" | "PENALTY_SHOOTOUTS" | "RED_CARDS" | null;
  } = {};

  // Map a question to a match-stat so its answer auto-resolves from match data.
  if (metric !== undefined) {
    data.metric = metric && VALID_METRICS.includes(metric)
      ? (metric as "TOTAL_GOALS" | "FINAL_GOALS" | "PENALTY_SHOOTOUTS" | "RED_CARDS")
      : null;
  }

  // NUMBER questions are graded by closeness to a single correct value.
  if (correctAnswer !== undefined) {
    data.correctAnswer = String(correctAnswer ?? "").trim() || null;
  }

  // TEXT questions are graded manually: the admin ticks which submitted answers
  // count, stored as their normalized keys.
  if (acceptedAnswers !== undefined) {
    if (!Array.isArray(acceptedAnswers)) return badRequest("acceptedAnswers must be an array");
    const keys = Array.from(
      new Set(acceptedAnswers.map((a) => normalizeAnswer(String(a))).filter(Boolean))
    );
    data.acceptedAnswers = keys;
  }

  const question = await prisma.tieBreakerQuestion.update({
    where: { id: questionId, tournamentId },
    data,
  });

  return new Response(JSON.stringify({ question }), { status: 200 });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { tournamentId } = await context.params;

  const body = await request.json();
  const { questionId } = body as { questionId: string };

  if (!questionId) return badRequest("questionId is required");

  await prisma.tieBreakerQuestion.delete({
    where: { id: questionId, tournamentId },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
