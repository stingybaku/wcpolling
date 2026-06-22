import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { seedDemo, DEMO_DOMAIN, DEMO_PASSWORD } from "@/lib/seed-demo";

// Seeding does many writes against a possibly-cold Aurora cluster; give it room.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * One-off demo seeder, guarded by the SEED_SECRET env var.
 *
 * There is no shell on Vercel to run `npm run seed:demo`, and the prod Aurora DB
 * is only reachable from inside the Vercel runtime (IAM auth). This route runs
 * the same idempotent seed logic on demand:
 *
 *   curl -X POST https://<app>/api/admin/seed-demo -H "x-seed-secret: $SEED_SECRET"
 *
 * Returns 404 unless SEED_SECRET is configured, so it's invisible in any
 * environment where you haven't deliberately enabled it.
 */
function secretMatches(provided: string | null): boolean {
  const expected = process.env.SEED_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // If no secret is configured, the route does not exist as far as callers know.
  if (!process.env.SEED_SECRET) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const provided =
    request.headers.get("x-seed-secret") ??
    request.nextUrl.searchParams.get("secret");
  if (!secretMatches(provided)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  try {
    const summary = await seedDemo();
    return Response.json({
      ok: true,
      ...summary,
      login: `demo1..demo${summary.users}@${DEMO_DOMAIN} / "${DEMO_PASSWORD}"`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Seed failed";
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500 });
  }
}
