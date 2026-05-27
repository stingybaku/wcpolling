import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, badRequest } from "@/app/api/helpers";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { id } = await context.params;
  if (!id) return badRequest("Missing tournament id");

  const stages = await prisma.tournamentStage.findMany({
    where: { tournamentId: id },
    orderBy: { order: "asc" },
    include: {
      _count: {
        select: { stageMatches: true },
      },
      qualificationResult: {
        select: { id: true },
      },
    },
  });

  return new Response(JSON.stringify({ stages }), { status: 200 });
}
