import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// App role — NOSUPERUSER, NOBYPASSRLS. RLS policies enforce on this connection.
// Used by API routes and any org-scoped work (via withRlsContext).
const client = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

// Service role — superuser, bypasses RLS. Used by Inngest background jobs
// that legitimately operate across orgs (cron, cleanup, cross-org queries).
const serviceClient = postgres(
  process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL!,
  { max: 5, idle_timeout: 20, connect_timeout: 10 },
);

export const serviceDb = drizzle(serviceClient, { schema });

export type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | TxClient;

export async function withRlsContext<T>(
  orgId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
    );
    return fn(tx);
  });
}

/** @deprecated Use withRlsContext — set_config(..., true) is a no-op outside a transaction */
export async function setRlsContext(
  dbInstance: ReturnType<typeof drizzle>,
  orgId: string,
): Promise<void> {
  await dbInstance.execute(
    sql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
  );
}
