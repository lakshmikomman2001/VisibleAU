import { isIP } from "node:net";

/**
 * 8 Nov (brand-feature locks and pricing claims, part 5) -- which requests better-auth's own limiter counts,
 * now that its counts live in Postgres (auth_rate_limits, migration 0140), shared by every instance.
 *
 * better-auth 1.6.14 counts every request through its handler (/api/auth/*): a read before it, a read and a
 * write after (node_modules/better-auth/dist/api/rate-limiter/index.mjs onRequestRateLimit,
 * onResponseRateLimit), keyed by the caller's address and the path -- sign-out, a verification link and
 * every organisation call included. Only the routes its own stricter rules guard need a count: 3 tries per
 * 10 seconds to sign in, sign up or change a password or address, 3 a minute to send a reset or a
 * verification email. They keep those numbers here; every other route keeps no count, and no row. (Server
 * code that calls auth.api directly, getSession in the layouts included, never reaches the limiter.)
 *
 * The caller is the first x-forwarded-for address, as better-auth reads it (dist/utils/get-request-ip.mjs):
 * on Vercel the client's public address, a header Vercel overwrites rather than forwards ("to prevent IP
 * spoofing", vercel.com/docs/headers/request-headers). A request with no address isn't counted. In
 * production better-auth skips it already; in development and tests it would count it as 127.0.0.1, one
 * counter for everybody, which with a shared store would let three bad passwords from anyone lock everyone
 * out.
 */
export const COUNTED_AUTH_PATHS = [
  "/sign-in/**",
  "/sign-up/**",
  "/change-password",
  "/change-email",
  "/request-password-reset",
  "/forget-password/**",
  "/reset-password/**",
  "/send-verification-email",
] as const;

/** better-auth's rule shape: so many requests per window (seconds). */
export interface AuthRateLimitRule {
  window: number;
  max: number;
}

type CustomRule =
  | false
  | ((request: Request, current: AuthRateLimitRule) => AuthRateLimitRule | false);

/** The caller's address: the first x-forwarded-for entry, if it's an IP address. */
export function callerIp(request: Request): string | null {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && isIP(first) !== 0 ? first : null;
}

/**
 * better-auth's rateLimit.customRules: the counted routes keep the rule better-auth gives them, for a request
 * with a caller's address; a request without one, and every other route, keeps no count. better-auth takes
 * the first key that matches (wildcards: "*" within a path segment, "**" across them), so "/**" is last.
 */
export function authRateLimitRules(): Record<string, CustomRule> {
  const perCaller = (request: Request, current: AuthRateLimitRule) =>
    callerIp(request) ? current : false;
  return {
    ...Object.fromEntries(COUNTED_AUTH_PATHS.map((path) => [path, perCaller])),
    "/**": false,
  };
}
