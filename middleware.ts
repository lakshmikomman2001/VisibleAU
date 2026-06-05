import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { detectRegion } from "@/lib/region/detect";

const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/api/auth",
  "/api/webhooks",
  "/api/health",
  "/methodology",
  "/pricing",
];
const PUBLIC_PREFIXES = ["/_next/", "/favicon", "/images/", "/fonts/"];

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
    return response;
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(signInUrl);
  }

  const response = NextResponse.next();
  response.headers.set("x-visibleau-region", region);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
