import { withAuth } from "next-auth/middleware";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

// Strip the internal port injected by Railway's reverse proxy from outgoing
// redirect Location headers so the browser never sees :3000 in the URL.
function stripPortFromRedirect(res: NextResponse): NextResponse {
  const location = res.headers.get("location");
  if (!location) return res;
  try {
    const url = new URL(location);
    if (url.port && url.hostname !== "localhost") {
      url.port = "";
      res.headers.set("location", url.toString());
    }
  } catch {
    // relative URL — nothing to strip
  }
  return res;
}

// Strip port from the incoming request URL so middleware logic (e.g. path
// matching) doesn't see the internal port either.
function stripPort(req: NextRequest): NextRequest {
  if (!req.nextUrl.port || req.nextUrl.hostname === "localhost") return req;
  const url = req.nextUrl.clone();
  url.port = "";
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
    return stripPortFromRedirect(await (authMiddlewares[locale] as any)(req, {}));
  }

  return stripPortFromRedirect(await intlMiddleware(req));
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
