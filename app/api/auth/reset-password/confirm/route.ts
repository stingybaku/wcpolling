import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");

  if (!token) return new Response(JSON.stringify({ error: "Token is required" }), { status: 400 });
  if (!password || password.length < 8) {
    return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400 });
  }

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || record.expires < new Date()) {
    return new Response(JSON.stringify({ error: "Invalid or expired reset token" }), { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: record.identifier }, select: { id: true } });
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found" }), { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } });
  await prisma.verificationToken.delete({ where: { token } });

  return new Response(JSON.stringify({ message: "Password updated successfully" }), { status: 200 });
}
