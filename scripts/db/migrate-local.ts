/**
 * Task #46 (7th follow-up): the one reliable local migration path.
 * `pnpm db:migrate` (drizzle-kit migrate) only ever replays drizzle-kit's
 * own tracked snapshot (migrations 0000-0011) -- confirmed this session
 * that `drizzle.__drizzle_migrations` is completely empty on all three
 * local databases, meaning it was never actually the apply path for
 * ANY of them. Migrations 0012 onward are hand-written and, until now,
 * only ever applied by hand via `psql -f`, one file at a time, in
 * filename order -- exactly how all three local databases drifted by
 * 12-16 columns (see docs/ops/post-launch-db-hardening.md section 46,
 * 6th and 7th follow-ups).
 *
 * This applies EVERY migration file (0000 through the newest, plus the
 * unnumbered sprint-8-tables.sql) in plain lexicographic filename
 * order -- which already produces the correct historical apply order
 * for the three known same-prefix pairs (0008, 0010, 0011; see
 * docs/ops/post-launch-db-hardening.md section 1) without any special
 * casing. Every file is idempotent (`IF NOT EXISTS` / `DO $$ ...
 * EXCEPTION WHEN duplicate_object`), so re-running this is always safe;
 * a ledger table (`_local_migrations_applied`) just makes repeat runs
 * fast by skipping files already recorded as applied.
 *
 * Usage: pnpm db:migrate:local
 *   Reads DIRECT_URL (matching drizzle.config.ts's own convention),
 *   falling back to DATABASE_URL. Refuses to run against anything but
 *   a disposable local database (scripts/db/local-db-guard.ts) --
 *   there is no prod variant of this script; prod schema changes go
 *   through db/prod-fixes/ files Sri runs by hand in the Neon editor.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { assertLocalSafeDatabaseUrl } from "./local-db-guard";

const MIGRATIONS_DIR = join(__dirname, "../../db/migrations");

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("db:migrate:local: neither DIRECT_URL nor DATABASE_URL is set.");
    process.exit(1);
  }
  assertLocalSafeDatabaseUrl(url);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const sql = postgres(url, { max: 1 });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _local_migrations_applied (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const appliedRows = await sql<{ filename: string }[]>`SELECT filename FROM _local_migrations_applied`;
    const applied = new Set(appliedRows.map((r) => r.filename));

    let appliedCount = 0;
    let skippedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        skippedCount++;
        continue;
      }
      const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`applying: ${file}`);
      await sql.unsafe(text);
      await sql`INSERT INTO _local_migrations_applied (filename) VALUES (${file})`;
      appliedCount++;
    }

    console.log(
      `db:migrate:local: done. ${appliedCount} applied, ${skippedCount} already applied (skipped).`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("db:migrate:local failed:", err);
  process.exit(1);
});
