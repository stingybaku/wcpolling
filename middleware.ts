import { withAuth } from "next-auth/middleware";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

// Returns the real public hostname from x-forwarded-host, falling back to the
// request hostname. Railway binds internally to 0.0.0.0 but sets x-forwarded-host
// to the actual public domain.
function publicHost(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-host");
  return fwd ? fwd.split(":")[0] : req.nextUrl.hostname;
}

// Strip the internal port and 0.0.0.0 hostname from outgoing redirect Location
// headers so the browser never sees Railway's internal binding.
function stripPortFromRedirect(res: NextResponse, req: NextRequest): NextResponse {
  const location = res.headers.get("location");
  if (!location) return res;
  try {
    const url = new URL(location);
    let changed = false;
    if (url.port && url.hostname !== "localhost") {
      url.port = "";
      changed = true;
    }
    if (url.hostname === "0.0.0.0") {
      url.hostname = publicHost(req);
      changed = true;
    }
    if (changed) res.headers.set("location", url.toString());
  } catch {
    // relative URL — nothing to strip
  }
  return res;
}

// Strip port and replace 0.0.0.0 on the incoming request URL so that
// middleware logic (path matching, NextAuth sign-in redirects) uses the
// correct public origin.
function stripPort(req: NextRequest): NextRequest {
  const needsHostFix = req.nextUrl.hostname === "0.0.0.0";
  const needsPortFix = !!req.nextUrl.port && req.nextUrl.hostname !== "localhost";
  if (!needsHostFix && !needsPortFix) return req;
  const url = req.nextUrl.clone();
  if (needsPortFix) url.port = "";
  if (needsHostFix) url.hostname = publicHost(req);
  return new NextRequest(url, req);
}

const intlMiddleware = createMiddleware(routing);

const { locales, defaultLocale } = routing;

// Pre-create an auth middleware per locale so the sign-in redirect is locale-aware.
const authMiddlewares = Object.fromEntries(
  locales.map((locale) => [
    locale,
    withAuth(
      function onSuccess(req) {
        return intlMiddleware(req);
      },
      {
        pages: { signIn: `/${locale}/auth/signin` },
        callbacks: { authorized: ({ token }) => !!token },
      }
    ),
  ])
);

const protectedPathPrefixes = ["/dashboard"];

export default async function middleware(req: NextRequest) {
  req = stripPort(req);
  const { pathname } = req.nextUrl;

  // API routes are protected at the handler level — skip locale/auth middleware.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Determine if this is a protected UI path (under /{locale}/dashboard).
  const isProtected = locales.some((locale) =>
    protectedPathPrefixes.some(
      (prefix) =>
        pathname === `/${locale}${prefix}` ||
        pathname.startsWith(`/${locale}${prefix}/`)
    )
  );

  if (isProtected) {
    const locale = locales.find((l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`) ?? defaultLocale;
    return stripPortFromRedirect(await (authMiddlewares[locale] as any)(req, {}), req);
  }

  return stripPortFromRedirect(await intlMiddleware(req), req);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
