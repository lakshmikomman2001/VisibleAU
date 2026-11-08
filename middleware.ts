import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { detectRegion } from "@/lib/region/detect";

const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  // Team follow-ups, item 4: an invite's preview and sign-up, before anyone is signed in (the token is the key).
  "/api/invites",
  "/api/webhooks",
  "/api/health",
  "/api/badge",
  "/api/demo",
  "/api/sample-audit",
  "/api/visit",
  "/sample-audit",
  "/client-portal",
  "/methodology",
  "/pricing",
  "/about",
  "/privacy",
  "/terms",
  "/robots.txt",
  "/sitemap.xml",
];
const PUBLIC_PREFIXES = ["/_next/", "/favicon", "/images/", "/fonts/"];

/**
 * Follow-ups from d247ba7..f13411d, part 3 -- pages whose URL can carry a token: an invite link
 * (/invite/<org>/<token>), the sign-in and sign-up pages it passes through (?redirectTo=/invite/...), and a
 * password reset link. The browser sends no Referer from them, so the token never reaches another site, or
 * a log of this one.
 *
 * Follow-ups from 6e27afc..01a6a8c, part 5 -- this is the only place it's set for
 * them, and it's decided on the path as requested, the same one vercel.json's rules
 * match: vercel.json sets strict-origin-when-cross-origin on every other path and
 * nothing on these, so a response carries exactly one Referrer-Policy. (It also set
 * no-referrer here, and the middleware went by the path without a region prefix, so
 * /nz/sign-in -- a 404 -- would have had both.)
 */
const NO_REFERRER_PAGES = ["/invite", "/sign-in", "/sign-up", "/reset-password"];

export function carriesToken(pathname: string): boolean {
  return NO_REFERRER_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}

function withReferrerPolicy(pathname: string, response: NextResponse): NextResponse {
  if (carriesToken(pathname)) response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const region = detectRegion({
    pathname,
    geoCountry: (request as unknown as { geo?: { country?: string } }).geo?.country,
  });

  // Strip region prefix for public route matching (e.g. /nz/pricing → /pricing)
  const strippedPath = pathname.replace(/^\/(au|nz|uk|us|ca|eu)\//, "/");
  if (
    PUBLIC_ROUTES.some(
      (route) =>
        strippedPath === route ||
        strippedPath.startsWith(`${route}/`) ||
        pathname === route ||
        pathname.startsWith(`${route}/`),
    )
  ) {
    const response = NextResponse.next();
    response.headers.set("x-visibleau-region", region);
    return withReferrerPolicy(pathname, response);
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirectTo", pathname);
    return withReferrerPolicy(pathname, NextResponse.redirect(signInUrl));
  }

  const response = NextResponse.next();
  response.headers.set("x-visibleau-region", region);
  return withReferrerPolicy(pathname, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
