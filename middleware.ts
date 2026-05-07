import { withAuth } from "next-auth/middleware";
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

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

export default function middleware(req: NextRequest) {
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
    return (authMiddlewares[locale] as any)(req, {});
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
