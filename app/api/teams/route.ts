import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized } from "@/app/api/helpers";

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const teams = await prisma.team.findMany({
    include: {
      groupMemberships: {
        include: { group: true },
        orderBy: [{ seed: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  return new Response(JSON.stringify({ teams }), { status: 200 });
}
