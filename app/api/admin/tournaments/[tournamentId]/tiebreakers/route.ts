import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";

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

  const questions = await prisma.tieBreakerQuestion.findMany({
    where: { tournamentId },
    orderBy: { sortOrder: "asc" },
  });

  return new Response(JSON.stringify({ questions }), { status: 200 });
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
