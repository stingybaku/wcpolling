import { NextResponse } from "next/server";
import { seedDatabase } from "@/prisma/seed";

// On-demand database seed endpoint. Like the migrate route, it runs at the Node
// runtime so it can open an IAM-authenticated Postgres connection (which only
// works from Vercel functions, not the build). Protected by MIGRATE_SECRET.
// The seed is idempotent (upserts + existence guards), so it is safe to re-run.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  try {
    await seedDatabase();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
