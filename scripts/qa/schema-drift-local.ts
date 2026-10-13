/**
 * Task #46 (7th follow-up): `pnpm db:drift:local` -- the local-only
 * variant of `pnpm db:drift` that doesn't need DATABASE_URL_FOR_DRIFT
 * exported by hand every time. Resolves DIRECT_URL (matching
 * drizzle.config.ts's own convention), falling back to DATABASE_URL,
 * and refuses to run against anything but a disposable local database
 * (scripts/db/local-db-guard.ts) before handing off to the same
 * checkSchemaDrift() the generic `pnpm db:drift` and the integration
 * test bootstrap (tests/integration/global-setup.ts) both use.
 */
import { assertLocalSafeDatabaseUrl } from "../db/local-db-guard";
import { checkSchemaDrift } from "./schema-drift";

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("db:drift:local: neither DIRECT_URL nor DATABASE_URL is set.");
    process.exit(1);
  }
  assertLocalSafeDatabaseUrl(url);

  const dbName = new URL(url).pathname.replace(/^\//, "");
  const { fatals, warns, tableCount, liveTableCount, liveTableCountExpected, livePolicyCount, livePolicyCountExpected } =
    await checkSchemaDrift(url);

  console.log(`\n=== schema-drift: ${dbName} (${tableCount} TS tables checked) ===\n`);
  console.log(
    `Launch invariants: ${liveTableCount} tables (expected ${liveTableCountExpected}), ${livePolicyCount} policies (expected ${livePolicyCountExpected})\n`,
  );

  if (fatals.length > 0) {
    console.log(`FATAL (${fatals.length}):`);
    for (const f of fatals) console.log(`  ✗ ${f}`);
    console.log("");
  }
  if (warns.length > 0) {
    console.log(`WARN (${warns.length}):`);
    for (const w of warns) console.log(`  ⚠ ${w}`);
    console.log("");
  }
  if (fatals.length === 0) {
    console.log("No FATAL drift.");
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("db:drift:local failed:", err);
  process.exit(1);
});
