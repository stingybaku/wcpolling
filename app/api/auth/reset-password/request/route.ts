import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { resetPasswordEmail } from "@/lib/emails/resetPassword";
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

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

    const { subject, html } = resetPasswordEmail(resetUrl);
    await sendEmail({ to: email, subject, html });
  }

  return new Response(
    JSON.stringify({ message: "If that email is registered, you will receive a password reset link shortly." }),
    { status: 200 }
  );
}
