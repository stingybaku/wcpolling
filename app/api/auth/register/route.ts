import { badRequest } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

// Simple in-memory rate limiter: max 5 requests per 15 minutes per IP.
// NOTE: This is per-process only. In multi-process or serverless deployments
// use a shared store (Redis, Upstash, etc.) instead.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), { status: 429 });
  }

  const body = await request.json();
  const name = String(body.name ?? "").trim() || null;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) return badRequest("email and password are required");
  if (password.length < 8) return badRequest("Password must be at least 8 characters");

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) return badRequest("An account with that email already exists");

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: hashPassword(password),
      role: "USER",
      // No email infrastructure — mark verified immediately on registration.
      emailVerified: new Date(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  return new Response(JSON.stringify({ user }), { status: 201 });
}
