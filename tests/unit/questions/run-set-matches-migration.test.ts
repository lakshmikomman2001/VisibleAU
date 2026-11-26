/**
 * S02 parts 1-2: prod-fix 0155's run2 carries migration 0155 verbatim (Sri runs the prod-fix in Neon; the migration is
 * what local databases and the tests get), so the two can never drift. Its backfill section is what
 * tests/integration/question-library-backfill.integration.test.ts runs on fixtures, and run1 checks with the same
 * SQL rule for a question that names the business.
 */
import { describe, expect, it } from "vitest";
import { sourceText } from "@/tests/helpers/source-files";

const MIGRATION = "db/migrations/0155_question_library.sql";
const RUN = (n: number, name: string) => `db/prod-fixes/0155-s02-run${n}-${name}.sql`;

function between(text: string, begin: string, end: string): string {
  const from = text.indexOf(begin);
  const to = text.indexOf(end);
  expect(from, begin).toBeGreaterThan(-1);
  expect(to, end).toBeGreaterThan(from);
  return text.slice(from + begin.length, to);
}

/** A function's whole definition, from its CREATE to its LANGUAGE line. */
function definition(text: string, name: string): string {
  const from = text.indexOf(`CREATE OR REPLACE FUNCTION pg_temp.${name}(`);
  expect(from, name).toBeGreaterThan(-1);
  const to = text.indexOf("LANGUAGE plpgsql IMMUTABLE;", from);
  return text.slice(from, to);
}

describe("prod-fix 0155", () => {
  it("run2's schema section is migration 0155, verbatim", () => {
    const run2 = sourceText(RUN(2, "apply"));
    const schema = between(
      run2,
      "-- ==== 0155 SCHEMA (begin) ====\n",
      "\n-- ==== 0155 SCHEMA (end) ====",
    );
    expect(schema).toBe(sourceText(MIGRATION).trimEnd());
  });

  it("run2 is one transaction that stops unless its role bypasses RLS, then the backfill", () => {
    const run2 = sourceText(RUN(2, "apply"));
    expect(run2.indexOf("BEGIN;")).toBeLessThan(run2.indexOf("rolbypassrls"));
    expect(run2.indexOf("-- ==== BACKFILL (begin) ====")).toBeGreaterThan(
      run2.indexOf("-- ==== 0155 SCHEMA (end) ===="),
    );
    expect(run2.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("run1 checks with the same SQL rule run2 types questions by", () => {
    const run1 = sourceText(RUN(1, "precheck"));
    const run2 = sourceText(RUN(2, "apply"));
    for (const fn of ["s02_name_matches", "s02_is_branded"]) {
      expect(definition(run1, fn), fn).toBe(definition(run2, fn));
    }
  });

  it("run3 and run4 exist, run3 rolls back, run4 removes only the backfill's rows", () => {
    expect(sourceText(RUN(3, "post-check")).trimEnd().endsWith("ROLLBACK;")).toBe(true);
    const run4 = sourceText(RUN(4, "rollback"));
    expect(run4).toContain("note = '0155 backfill: the stored question pack'");
    expect(run4).not.toMatch(/^DROP TABLE/m);
  });
});
