/**
 * 13 Nov (Sri, part 6): a Date inside a raw `sql` template reaches Postgres as local-time text (Drizzle's
 * postgres-js driver switches postgres-js's date serializers off) -- found in 6376c8a for the alert dedupe's
 * cutoff. Vercel runs in UTC, so production may be fine today; local and test runs (Sydney) and any other
 * host aren't. Every point in time in a raw template goes as an ISO string with ::timestamptz, through
 * db/sql-timestamp.ts sqlTimestamp(). This scans every source file with the TypeScript checker (by type,
 * not by name), and checks itself on a fixture.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dateInterpolationsInSql } from "@/tests/helpers/raw-sql-dates";

const REPO = process.cwd();
const ROOTS = ["app", "lib", "inngest", "db", "components", "scripts"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("no Date inside a raw sql template", () => {
  it("finds the fixture's two and only them (the guard works)", () => {
    expect(
      dateInterpolationsInSql([join(REPO, "tests/fixtures/raw-sql-date/bad-and-good.ts")], REPO),
    ).toEqual([
      `tests/fixtures/raw-sql-date/bad-and-good.ts:9  \${cutoff}`,
      `tests/fixtures/raw-sql-date/bad-and-good.ts:10  \${maybeUntil}`,
    ]);
  }, 120_000);

  it("the app, lib, Inngest, db, components and scripts have none", () => {
    const files = ROOTS.flatMap((root) => sources(join(REPO, root)));
    expect(files.length).toBeGreaterThan(500);
    expect(dateInterpolationsInSql(files, REPO)).toEqual([]);
  }, 120_000);
});
