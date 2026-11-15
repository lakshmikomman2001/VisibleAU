import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { LEGACY_TRACKING_SNIPPET_PATH, TRACKING_SNIPPET_PATH } from "@/lib/product";
import { detectRegion } from "@/lib/region/detect";
import { GEO_COUNTRY_HEADER, REGION_HEADER } from "@/lib/region/header";
import { isUnbuiltTrustPage } from "@/lib/trust/stub-implementation-status";

/** A path no route matches: rewritten to, it renders app/not-found.tsx. */
export const NO_SUCH_PAGE_PATH = "/_no-such-page";

const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  // Team follow-ups, item 4: an invite's preview and sign-up, before anyone is signed in (the token is the key).
  "/api/invites",
  // Live invite test follow-ups (8 Nov), part 1: the invite page itself decides, from the invite row, where
  // someone who isn't signed in goes -- sign-up for a new account, sign-in for an account.
  "/invite",
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
  // Rebrand (15 Nov), part 1: the web manifest (app/manifest.ts) -- a browser fetches it without a session.
  // The icons (.ico, .svg, .png) never reach the middleware (config.matcher below).
  "/manifest.webmanifest",
  // The tracking snippet a site owner copies, under its name and its old one (Playwright-run follow-ups,
  // 10 Nov): opened without a session, it was a 307 to /sign-in.
  TRACKING_SNIPPET_PATH,
  LEGACY_TRACKING_SNIPPET_PATH,
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
    geoCountry: request.headers.get(GEO_COUNTRY_HEADER) ?? undefined,
  });
  // Playwright-run follow-ups (10 Nov), part 8: the region goes on the REQUEST, where the pricing page reads it
  // (`headers()`); it was set on the response, which no page sees. It replaces any value the visitor sent.
  const withRegion = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REGION_HEADER, region);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };

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
    return withReferrerPolicy(pathname, withRegion());
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirectTo", pathname);
    return withReferrerPolicy(pathname, NextResponse.redirect(signInUrl));
  }

  // 17 Nov (part 2 follow-up): a trust check that isn't built has no page -- the app's own 404, with a 404
  // status, before the brand layout renders (a notFound() under it drew the signed-in shell twice).
  if (isUnbuiltTrustPage(strippedPath)) {
    return NextResponse.rewrite(new URL(NO_SUCH_PAGE_PATH, request.url));
  }

  return withReferrerPolicy(pathname, withRegion());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
