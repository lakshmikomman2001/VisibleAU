/**
 * Leftovers task, part 6 (17 Nov; Sri's production check of 16 Nov): visibility_trends keeps its old definitions
 * (distinct questions pooled across a week's audits, unverified mentions counted, "cited" meaning the brand's own
 * domain: Hero W46 81.82 / 0.00 while its audit page says 33%), so nothing a customer sees reads it. Its last reader,
 * the wins feed's "Mention rate up", now compares the audits themselves (lib/communication/wins-feed.ts). This
 * guard keeps it so: the table is written by the weekly-trend recompute and cleared by an exclusion, and read by
 * nothing else.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NON_TEST_ROOTS, readSourcesBeforeAll, sourceFiles } from "@/tests/helpers/source-files";

readSourcesBeforeAll([...NON_TEST_ROOTS]);

/** The files allowed to name the table: its schema, its writer, the exclusion that clears a week. */
const ALLOWED = new Set([
  "db/schema/visibility-trends.ts",
  "db/schema/index.ts",
  "lib/visibility/refresh-weekly-trend.ts",
  "lib/visibility/visibility-trend-aggregator.ts",
  "lib/admin/trend-exclusions.ts",
]);

/** The code without its comments (block, JSX and line comments not inside a URL), as the copy guards strip them. */
function withoutComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

describe("nothing a customer sees reads visibility_trends", () => {
  it("only the schema, the weekly recompute and the exclusion name the table", () => {
    const readers = sourceFiles(NON_TEST_ROOTS)
      .filter((f) => /\.(ts|tsx)$/.test(f.path) && !f.path.startsWith("scripts/"))
      .filter((f) => /\bvisibilityTrends\b|\bvisibility_trends\b/.test(withoutComments(f.text)))
      .map((f) => f.path)
      .filter((p) => !ALLOWED.has(p));
    expect(readers).toEqual([]);
  });

  it("the wins feed's 'visibility up' compares audits (audit-change), never trend rows", () => {
    const wins = readFileSync("lib/communication/wins-feed.ts", "utf8");
    expect(wins).toContain("auditChanges(");
    expect(withoutComments(wins)).not.toMatch(
      /visibilityTrends|periodModelSetKeys|Mention rate up/,
    );
  });
});
