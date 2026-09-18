/**
 * Fresh-build schema drift guard.
 *
 * Asserts the Drizzle TS schema (db/schema/index.ts) has zero FATAL drift
 * against whatever database DATABASE_URL points at — i.e. every column the
 * TS schema declares actually exists live. Run this against a database that
 * just replayed the full migration chain (0000 -> latest) from empty to catch
 * exactly the class of bug that caused the organizations/audits column gaps
 * (see db/migrations/README.md and migration 0030): a later migration's
 * `CREATE TABLE IF NOT EXISTS` silently no-oping because an earlier migration
 * already created the table without the newer columns.
 *
 * drizzle-kit's own `check`/`generate` cannot catch this — its snapshot
 * tracking is stuck at migration 0011 (see db/migrations/README.md) and has
 * no visibility into the hand-written migrations that introduced the gap.
 */
import { describe, expect, it } from "vitest";
import { checkSchemaDrift } from "@/scripts/qa/schema-drift";

describe("schema drift: TS schema vs live database", () => {
  it("has zero FATAL drift (every TS-declared column exists live, launch invariants hold)", async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL is not set — this test needs a real database connection.");
    }

    const {
      fatals,
      warns,
      tableCount,
      liveTableCount,
      liveTableCountExpected,
      livePolicyCount,
      livePolicyCountExpected,
    } = await checkSchemaDrift(dbUrl);

    console.log(
      `Launch invariants: ${liveTableCount} tables (expected ${liveTableCountExpected}), ${livePolicyCount} policies (expected ${livePolicyCountExpected})`,
    );

    if (fatals.length > 0) {
      console.error(`Schema drift FATAL (${fatals.length} of ${tableCount} tables checked):`);
      for (const f of fatals) console.error(`  - ${f}`);
    }
    if (warns.length > 0) {
      console.warn(`Schema drift WARN (${warns.length}) — informational, not a test failure:`);
      for (const w of warns) console.warn(`  - ${w}`);
    }

    expect(
      fatals,
      "See console output above for the exact column(s) missing live or invariant mismatch",
    ).toEqual([]);
  });
});
