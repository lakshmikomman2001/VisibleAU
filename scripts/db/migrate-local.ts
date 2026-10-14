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
 * casing. Every hand-written file (0012+) is idempotent (`IF NOT
 * EXISTS` / `DO $$ ... EXCEPTION WHEN duplicate_object`), so
 * re-running this is always safe for them; a ledger table
 * (`_local_migrations_applied`) just makes repeat runs fast by
 * skipping files already recorded as applied.
 *
 * BASELINING (task #46, 8th follow-up): migrations 0000-0011 are
 * drizzle-kit-GENERATED, NOT idempotent (plain `CREATE TYPE`/`CREATE
 * TABLE`, no guards) -- unlike every file from 0012 on. A database
 * that already has that range applied by hand (every local database
 * this project has ever had, confirmed: `visibleau`, `visibleau_e2e`,
 * `visibleau_prod` were all migrated this way originally, long before
 * this ledger existed) fails immediately on 0000 the first time this
 * script runs against it, because the ledger starts empty and the
 * script has no record that 0000-0011 are already done. Detected by
 * checking whether `organizations` (created in 0000) already exists:
 * if the ledger is empty AND that table is already there, this script
 * BASELINES -- records every 0000-0011 filename as applied WITHOUT
 * running them (their content is assumed already in effect) -- then
 * proceeds normally into the idempotent 0012+ range. A genuinely
 * empty database (no `organizations` table) skips baselining and runs
 * 0000 for real, exactly as before.
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

// The last drizzle-kit-GENERATED (non-idempotent) migration file in
// lexicographic order -- everything at or before this gets baselined
// instead of re-run against a database that already has it applied.
const LAST_NON_IDEMPOTENT_FILE = "0011_watery_cerebro.sql";

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

    if (applied.size === 0) {
      const [existing] = await sql<{ exists: boolean }[]>`
        SELECT to_regclass('public.organizations') IS NOT NULL AS exists
      `;
      if (existing?.exists) {
        let baselinedCount = 0;
        for (const file of files) {
          await sql`
            INSERT INTO _local_migrations_applied (filename) VALUES (${file})
            ON CONFLICT (filename) DO NOTHING
          `;
          applied.add(file);
          baselinedCount++;
          if (file === LAST_NON_IDEMPOTENT_FILE) break;
        }
        console.log(
          `db:migrate:local: baselined ${baselinedCount} pre-existing migration(s) up to ` +
            `${LAST_NON_IDEMPOTENT_FILE} ("organizations" already existed, ledger was empty) -- ` +
            `not re-run, recorded as already applied.`,
        );
      }
    }

    let appliedCount = 0;
    let skippedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        skippedCount++;
        continue;
      }
      // A UTF-8 BOM at the start of a file (0010_baseline-reconcile.sql
      // has one -- confirmed via a raw byte dump) is invisible in an
      // editor but is a real character Node's readFileSync does NOT
      // strip; Postgres's parser then sees it as the first token of
      // the statement and throws `42601 syntax error at or near ""`
      // (position 1). `psql -f` tolerates this; `sql.unsafe()` does
      // not -- strip it explicitly.
      const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(/^﻿/, "");
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
