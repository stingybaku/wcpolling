import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest, canViewGroupAsAdmin } from "@/app/api/helpers";
import { computeStagedLeaderboard } from "@/lib/staged-leaderboard";

export async function GET(request: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { groupId } = await context.params;
  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) return badRequest("Missing tournamentId query param");

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
  });
  if (!(await canViewGroupAsAdmin(user, groupId, membership))) return forbidden("Not a member of this group");

  const leaderboard = await computeStagedLeaderboard(groupId, tournamentId);

  return new Response(JSON.stringify({ leaderboard }), { status: 200 });
}
