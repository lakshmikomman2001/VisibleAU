import { checkPostgresRateLimit } from "@/lib/governance/pg-rate-limit";

/**
 * Follow-ups from d247ba7..f13411d, part 3 -- the public invite routes (/api/invites/[orgId]/[token]: the
 * sign-up page's preview and the sign-up itself) answer anyone, and the token is the only key, so each
 * request counts against two limits on the existing Postgres limiter (lib/governance/pg-rate-limit.ts,
 * which stores only a salted hash of what it counts):
 * - per caller IP, across both routes: someone opening their link and signing up makes a handful of
 *   requests; a script trying tokens makes many;
 * - per token, from anywhere: one invite's previews and sign-up attempts.
 */
export const INVITE_IP_LIMIT = { max: 60, windowMs: 10 * 60 * 1000 } as const;
export const INVITE_TOKEN_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 } as const;

export const INVITE_RATE_LIMITED = "Too many attempts. Wait a few minutes and try again.";

/** The caller's IP as the platform passes it, the way the other public routes read it. */
function callerIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** A 429 when this caller, or this token, has made too many requests; null otherwise. */
export async function inviteRateLimitRefusal(
  req: Request,
  organizationId: string,
  token: string,
): Promise<Response | null> {
  const byIp = await checkPostgresRateLimit({
    routeKey: "invite-public-ip",
    ip: callerIp(req),
    ...INVITE_IP_LIMIT,
  });
  const limited = !byIp.allowed
    ? byIp
    : await checkPostgresRateLimit({
        routeKey: "invite-public-token",
        ip: `${organizationId}:${token}`,
        ...INVITE_TOKEN_LIMIT,
      }).then((byToken) => (byToken.allowed ? null : byToken));
  if (!limited) return null;
  const retryAfter = Math.max(1, Math.ceil((limited.resetAt.getTime() - Date.now()) / 1000));
  return Response.json(
    { error: INVITE_RATE_LIMITED },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
