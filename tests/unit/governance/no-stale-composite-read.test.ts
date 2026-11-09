/**
 * Vunnara (19 Oct, post-aa83b3a) -- "the headline is the mention rate".
 * Grep-guard: audits.score_composite is now written as the mention rate
 * (never a blend) at audit-completion time, and kept as HISTORY only --
 * no reader may use it for display, sorting, or alerts going forward.
 * Every display/sort/alert surface must resolve the headline fresh via
 * lib/scoring/resolve-audit-dimensions.ts instead.
 *
 * A raw drizzle reference to the `audits.scoreComposite` COLUMN (as
 * opposed to a local `scoreComposite:` object key, which is just the
 * field NAME every reader keeps per the hotfix spec's "don't break
 * integrations" rule) is the one unambiguous, grep-able signal of "this
 * file is reading the stored column from the DB". Every current
 * occurrence is individually justified below; this test fails the
 * moment a NEW one appears anywhere else in the app, so it has to be
 * justified here too, not silently reintroduced.
 */
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const SCAN_DIRS = ["app", "lib", "inngest", "components"];
// One walk per file, cached (tests/helpers/source-files.ts); each test reads the cache.
readSourcesBeforeAll(SCAN_DIRS);

// file -> why this one raw read is safe, verified by hand against the
// current source at the time this test was written.
const ALLOWED: Record<string, string> = {
  "inngest/functions/generate-recommendations.ts":
    "reads the SAME audit's score immediately after run-audit[-inline].ts wrote it in the same audit.complete pipeline run -- not a cross-audit comparison, no staleness window exists.",
  "inngest/functions/trigger-validation-reaudit.ts":
    'the raw read is only `audit?.scoreComposite == null` -- an "did this audit produce a score at all" existence gate. The VALUE actually recorded (recordReauditResults) comes from a fresh resolveAuditDimensionsAndHeadline call a few lines below.',
  "app/api/brands/[brandId]/latest-audit/route.ts":
    "selects the raw column alongside other fields, but immediately overwrites it (`{...rawAudit, scoreComposite: headline ? ... : null}`) before the response is built -- the raw value is never actually returned.",
};

/** The code under SCAN_DIRS, not its tests. */
function listSourceFiles(): string[] {
  return sourcePaths(SCAN_DIRS).filter((path) => !/\.test\.tsx?$/.test(path));
}

function findRawColumnRefs(path: string): number {
  return (sourceText(path).match(/audits\.scoreComposite/g) ?? []).length;
}

describe("no reader uses the raw audits.scoreComposite column for display/sort/alerts", () => {
  it("every raw drizzle reference to audits.scoreComposite in app/lib/inngest/components is in the explicit, justified allowlist above", () => {
    const filesWithRawRef: string[] = [];
    const files = listSourceFiles();
    expect(files.length).toBeGreaterThan(500);
    for (const path of files) {
      if (findRawColumnRefs(path) > 0) filesWithRawRef.push(path);
    }

    for (const file of filesWithRawRef) {
      expect(
        ALLOWED,
        `${file} has a raw audits.scoreComposite reference with no justification on file -- either fix it to resolve the headline fresh, or add a justified entry to ALLOWED above`,
      ).toHaveProperty(file);
    }

    // And the reverse -- nothing in the allowlist should be stale (the
    // file no longer has the pattern at all, meaning the allowlist
    // entry should be deleted so this test keeps meaning something).
    for (const file of Object.keys(ALLOWED)) {
      expect(
        findRawColumnRefs(file),
        `${file} no longer references audits.scoreComposite -- remove its stale allowlist entry`,
      ).toBeGreaterThan(0);
    }
  });
});
