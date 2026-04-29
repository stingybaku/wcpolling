import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  return new Response(
    JSON.stringify({
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        image: user.image,
      },
    }),
    { status: 200 }
  );
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (!name) {
    return badRequest("Name is required");
  }

  if (newPassword && newPassword.length < 8) {
    return badRequest("New password must be at least 8 characters");
  }

  if (newPassword && user.passwordHash) {
    if (!currentPassword) {
      return badRequest("Current password is required");
    }

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return badRequest("Current password is incorrect");
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}),
    },
    select: { id: true, email: true, name: true, role: true, image: true },
  });

  return new Response(JSON.stringify({ profile: updatedUser }), { status: 200 });
}
