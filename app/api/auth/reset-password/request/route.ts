import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email) {
    return new Response(JSON.stringify({ error: "Email is required" }), { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  // Always return success to avoid email enumeration
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Clear any existing reset tokens for this email
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    await prisma.verificationToken.create({ data: { identifier: email, token, expires } });

    // No email infrastructure — log to server console for development use
    console.log(`[Password Reset] Token for ${email}: ${token}`);
    console.log(`[Password Reset] Expires: ${expires.toISOString()}`);
  }

  return new Response(
    JSON.stringify({ message: "If that email is registered, a reset token has been printed to the server console." }),
    { status: 200 }
  );
}
