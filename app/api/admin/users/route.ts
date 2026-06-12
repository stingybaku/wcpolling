import { badRequest, forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: {
          memberships: true,
          predictions: true,
          submissions: true,
        },
      },
      memberships: {
        select: {
          role: true,
          isActive: true,
          group: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ role: "desc" }, { createdAt: "desc" }],
  });

  return new Response(JSON.stringify({ users }), { status: 200 });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim() || null;
  const role = String(body.role ?? "USER").trim() === "ADMIN" ? "ADMIN" : "USER";
  const password = String(body.password ?? "");

  if (!email) return badRequest("email is required");
  if (password.length < 8) return badRequest("Password must be at least 8 characters");

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingUser) return badRequest("A user with that email already exists");

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      passwordHash: hashPassword(password),
    },
  });

  return new Response(JSON.stringify({ user }), { status: 201 });
}
