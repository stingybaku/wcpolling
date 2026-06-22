import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTournament, getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

type OptionInput = { key: string; label: { en?: string; es?: string } };

// Parse "YYYY-MM-DD" into a UTC-midnight Date matching the @db.Date column.
function parsePublishDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Validate the authoring payload shared by POST and PATCH. Returns the cleaned
// fields or an error message.
function validateBody(body: Record<string, unknown>):
  | { error: string }
  | { prompt: Record<string, string>; options: OptionInput[]; correctKey: string; points: number } {
  const prompt = body.prompt as { en?: string; es?: string } | undefined;
  if (!prompt?.en?.trim()) return { error: "prompt.en is required" };

  const rawOptions = Array.isArray(body.options) ? (body.options as OptionInput[]) : [];
  const options = rawOptions
    .map((o) => ({ key: String(o?.key ?? "").trim(), label: { en: o?.label?.en?.trim() ?? "", es: o?.label?.es?.trim() ?? "" } }))
    .filter((o) => o.key && o.label.en);
  if (options.length < 2) return { error: "At least two options (with key and English label) are required" };
  const keys = new Set(options.map((o) => o.key));
  if (keys.size !== options.length) return { error: "Option keys must be unique" };

  const correctKey = String(body.correctKey ?? "").trim();
  if (!keys.has(correctKey)) return { error: "correctKey must match one of the option keys" };

  const points = Number.isFinite(Number(body.points)) && Number(body.points) > 0 ? Math.floor(Number(body.points)) : 2;

  return {
    prompt: { en: prompt.en.trim(), es: prompt.es?.trim() || prompt.en.trim() },
    options,
    correctKey,
    points,
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const tournament = await getCurrentTournament(request.nextUrl.searchParams.get("tournamentId"), { allowArchived: true });
  if (!tournament) return badRequest("No tournament configured");

  const questions = await prisma.triviaQuestion.findMany({
    where: { tournamentId: tournament.id },
    orderBy: { publishDate: "desc" },
    include: { _count: { select: { answers: true } } },
  });
  return Response.json({ tournament: { id: tournament.id, name: tournament.name }, questions });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const tournament = await getCurrentTournament(String(body.tournamentId ?? "").trim() || null, { allowArchived: true });
  if (!tournament) return badRequest("No tournament configured");

  const publishDate = parsePublishDate(body.publishDate);
  if (!publishDate) return badRequest("publishDate must be YYYY-MM-DD");

  const parsed = validateBody(body);
  if ("error" in parsed) return badRequest(parsed.error);

  try {
    const question = await prisma.triviaQuestion.create({
      data: {
        tournamentId: tournament.id,
        publishDate,
        prompt: parsed.prompt,
        options: parsed.options,
        correctKey: parsed.correctKey,
        points: parsed.points,
      },
    });
    return Response.json({ question }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return badRequest("A trivia question already exists for that date");
    }
    throw err;
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return badRequest("id is required");

  const parsed = validateBody(body);
  if ("error" in parsed) return badRequest(parsed.error);

  const data: Prisma.TriviaQuestionUpdateInput = {
    prompt: parsed.prompt,
    options: parsed.options,
    correctKey: parsed.correctKey,
    points: parsed.points,
  };
  if (body.publishDate !== undefined) {
    const publishDate = parsePublishDate(body.publishDate);
    if (!publishDate) return badRequest("publishDate must be YYYY-MM-DD");
    data.publishDate = publishDate;
  }

  try {
    const question = await prisma.triviaQuestion.update({ where: { id }, data });
    return Response.json({ question });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return badRequest("A trivia question already exists for that date");
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return badRequest("Question not found");
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return badRequest("id is required");
  await prisma.triviaAnswer.deleteMany({ where: { questionId: id } });
  await prisma.triviaQuestion.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
