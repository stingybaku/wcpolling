import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function PUT(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { userId } = await context.params;
  if (!userId) return badRequest("Missing user id");

  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim() || null;
  const role = String(body.role ?? "USER").trim() === "ADMIN" ? "ADMIN" : "USER";
  const password = String(body.password ?? "");

  if (!email) return badRequest("email is required");
  if (password && password.length < 8) return badRequest("Password must be at least 8 characters");

  if (admin.id === userId && role !== "ADMIN") {
    return badRequest("You cannot remove your own admin role");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      email,
      name,
      role,
      ...(password ? { passwordHash: hashPassword(password) } : {}),
    },
  });

  return new Response(JSON.stringify({ user }), { status: 200 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { userId } = await context.params;
  if (!userId) return badRequest("Missing user id");

  if (admin.id === userId) {
    return badRequest("You cannot delete your own account");
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
