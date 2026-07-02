import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { syncMatchResults } from "@/lib/results/sync";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

// Pull match results (scores / shootouts / cards / status) from the configured
// external provider onto existing fixtures. Never touches stage results, the
// bracket, or prediction scoring. `?cards=1` also spends the card-event budget.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  const { id } = await context.params;

  const withCards = new URL(req.url).searchParams.get("cards") === "1";

  try {
    const summary = await syncMatchResults(id, { withCards });
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not pull results";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
