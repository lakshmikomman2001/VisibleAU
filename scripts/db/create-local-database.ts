import postgres from "postgres";
import { assertLocalSafeDatabaseUrl } from "./local-db-guard";

/**
 * 13 Nov, part 6: creates a local database when it doesn't exist yet (scripts/db/migrate-local.ts
 * --create-database), so `pnpm db:setup:integration` can make visibleau_integration from nothing. Local and
 * non-prod only (local-db-guard.ts), and only a plain lower-case name. Connects to the server's own `postgres`
 * database to do it, with the same credentials. Returns whether it created it.
 */
export async function createLocalDatabaseIfMissing(rawUrl: string): Promise<boolean> {
  assertLocalSafeDatabaseUrl(rawUrl);
  const target = new URL(rawUrl);
  const name = target.pathname.replace(/^\//, "");
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to create "${name}": only a plain lower-case database name.`);
  }
  const server = new URL(rawUrl);
  server.pathname = "/postgres";
  const sql = postgres(server.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await sql`SELECT 1 AS one FROM pg_database WHERE datname = ${name}`;
    if (exists) return false;
    await sql.unsafe(`CREATE DATABASE "${name}"`);
    return true;
  } finally {
    await sql.end();
  }
}
