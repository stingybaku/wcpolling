import { NextRequest } from "next/server";
import { badRequest, forbidden, getCurrentTournament, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const tournament = await getCurrentTournament(request.nextUrl.searchParams.get("tournamentId"), { allowArchived: true });
  if (!tournament) return badRequest("No tournament configured");

  const placements = await prisma.sponsoredPlacement.findMany({
    where: { tournamentId: tournament.id },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  return new Response(JSON.stringify({ placements }), { status: 200 });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const tournament = await getCurrentTournament(String(body.tournamentId ?? "").trim() || null, { allowArchived: true });
  if (!tournament) return badRequest("No tournament configured");

  const title = String(body.title ?? "").trim();
  const targetUrl = String(body.targetUrl ?? "").trim();

  if (!title || !targetUrl) return badRequest("Title and target URL are required");

  const placement = await prisma.sponsoredPlacement.create({
    data: {
      tournamentId: tournament.id,
      title,
      summary: String(body.summary ?? "").trim() || null,
      imageUrl: String(body.imageUrl ?? "").trim() || null,
      targetUrl,
      ctaLabel: String(body.ctaLabel ?? "").trim() || null,
      sponsorName: String(body.sponsorName ?? "").trim() || null,
      badgeLabel: String(body.badgeLabel ?? "").trim() || "Sponsored",
      priority: Number(body.priority ?? 0),
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      activeFrom: body.activeFrom ? new Date(String(body.activeFrom)) : null,
      activeTo: body.activeTo ? new Date(String(body.activeTo)) : null,
    },
  });

  return new Response(JSON.stringify({ placement }), { status: 201 });
}
