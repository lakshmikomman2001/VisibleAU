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
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
