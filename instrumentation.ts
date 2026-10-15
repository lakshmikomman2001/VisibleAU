export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Task #46 (13th follow-up): the prepush bundle's RLS role row can
    // only ever see whoever runs the bundle itself (the Neon editor's
    // owner role), never what Vercel's DATABASE_URL or Inngest's
    // SERVICE_DATABASE_URL actually connect as. Check both of the app's
    // own connections once per cold start instead. Fire-and-forget --
    // a role-check failure is worth logging, never worth failing boot
    // over.
    import("./lib/db/role-check")
      .then(async ({ logDbRoleCheck }) => {
        const { client, serviceClient } = await import("./db/client");
        await Promise.all([
          logDbRoleCheck(client, { connection: "app", expectedPrivileged: false }),
          logDbRoleCheck(serviceClient, { connection: "service", expectedPrivileged: true }),
        ]);
      })
      .catch((err) => {
        console.error(
          JSON.stringify({
            event: "db_role_check",
            error: err instanceof Error ? err.message : "failed to run db_role_check at startup",
          }),
        );
      });

    // Task #46 (17th follow-up): the previous follow-up's report-back said
    // the sample-audit rate limiters "fail open when unconfigured" as if
    // that were a safe default -- it silently is not, confirmed in prod
    // on 15 Oct (no UPSTASH_* env vars set at all). Logged once per cold
    // start in production so a missing Redis config shows up as a real
    // alert, not a silent no-op that's only noticed by reading old
    // report-backs. Only in production -- local/CI running without Redis
    // is expected and not worth alerting on. Never logs the env values
    // themselves, only which names were checked.
    if (process.env.NODE_ENV === "production") {
      import("./lib/sample-audit/rate-limit")
        .then(({ getRateLimiterBackend, RATE_LIMITER_ENV_NAMES }) => {
          if (getRateLimiterBackend() === "disabled") {
            console.error(
              JSON.stringify({
                event: "rate_limiter_disabled",
                reason: "missing_env",
                namesChecked: RATE_LIMITER_ENV_NAMES,
              }),
            );
          }
        })
        .catch((err) => {
          console.error(
            JSON.stringify({
              event: "rate_limiter_disabled",
              error:
                err instanceof Error ? err.message : "failed to check rate limiter status at startup",
            }),
          );
        });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
