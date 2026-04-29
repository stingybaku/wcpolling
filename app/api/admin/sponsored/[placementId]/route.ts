import { NextRequest } from "next/server";
import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function PUT(request: NextRequest, context: { params: Promise<{ placementId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { placementId } = await context.params;
  if (!placementId) return badRequest("Missing placement id");

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const targetUrl = String(body.targetUrl ?? "").trim();

  if (!title || !targetUrl) return badRequest("Title and target URL are required");

  const placement = await prisma.sponsoredPlacement.update({
    where: { id: placementId },
    data: {
      title,
      summary: String(body.summary ?? "").trim() || null,
      imageUrl: String(body.imageUrl ?? "").trim() || null,
      targetUrl,
      ctaLabel: String(body.ctaLabel ?? "").trim() || null,
      sponsorName: String(body.sponsorName ?? "").trim() || null,
      badgeLabel: String(body.badgeLabel ?? "").trim() || "Sponsored",
      priority: Number(body.priority ?? 0),
      isActive: Boolean(body.isActive),
      activeFrom: body.activeFrom ? new Date(String(body.activeFrom)) : null,
      activeTo: body.activeTo ? new Date(String(body.activeTo)) : null,
    },
  });

  return new Response(JSON.stringify({ placement }), { status: 200 });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ placementId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { placementId } = await context.params;
  if (!placementId) return badRequest("Missing placement id");

  await prisma.sponsoredPlacement.delete({
    where: { id: placementId },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
