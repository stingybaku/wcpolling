import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// On-demand endpoint to promote a user to ADMIN by email. Same pattern as the
// migrate/seed routes: runs at the Node runtime (IAM DB connection) and is
// guarded by MIGRATE_SECRET. Pass the target email via the `email` query param
// or JSON body.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorize(req: Request): boolean {
  const secret = process.env.MIGRATE_SECRET;
  if (!secret) return false;
  const provided =
    req.headers.get("x-migrate-secret") ?? new URL(req.url).searchParams.get("secret");
  return provided === secret;
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  let email = url.searchParams.get("email") ?? undefined;
  if (!email) {
    const body = await req.json().catch(() => null);
    email = body?.email;
  }
  if (!email) {
    return NextResponse.json({ error: "Missing 'email'" }, { status: 400 });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: `No user with email ${email}` }, { status: 404 });
    }
    const user = await prisma.user.update({
      where: { email },
      data: { role: "ADMIN" },
      select: { id: true, email: true, role: true },
    });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
