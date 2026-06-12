import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { isSupportedLocale } from "@/lib/locale";

// Persists the signed-in user's preferred language. Called by the client
// LocalePersister whenever the active locale changes (and on first load, which
// backfills existing users). Communications are sent in this stored locale.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const locale = String(body?.locale ?? "").trim();
  if (!isSupportedLocale(locale)) return badRequest("Unsupported locale");

  if (user.locale !== locale) {
    await prisma.user.update({ where: { id: user.id }, data: { locale } });
  }

  return new Response(JSON.stringify({ locale }), { status: 200 });
}
