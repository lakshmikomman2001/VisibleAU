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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const SCAN_DIRS = ["app", "lib", "inngest", "components"];
const SKIP_DIR_NAMES = new Set(["node_modules", ".next", ".git"]);

// file -> why this one raw read is safe, verified by hand against the
// current source at the time this test was written.
const ALLOWED: Record<string, string> = {
  "lib/agency/portfolio.ts":
    "getPortfolioMetrics() has zero callers anywhere in the app (grep confirms) -- dead code, not a live display/sort/alert surface.",
  "inngest/functions/generate-recommendations.ts":
    "reads the SAME audit's score immediately after run-audit[-inline].ts wrote it in the same audit.complete pipeline run -- not a cross-audit comparison, no staleness window exists.",
  "inngest/functions/trigger-validation-reaudit.ts":
    "the raw read is only `audit?.scoreComposite == null` -- an \"did this audit produce a score at all\" existence gate. The VALUE actually recorded (recordReauditResults) comes from a fresh resolveAuditDimensionsAndHeadline call a few lines below.",
  "app/api/brands/[brandId]/latest-audit/route.ts":
    "selects the raw column alongside other fields, but immediately overwrites it (`{...rawAudit, scoreComposite: headline ? ... : null}`) before the response is built -- the raw value is never actually returned.",
};

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

function findRawColumnRefs(absPath: string): number {
  const src = readFileSync(absPath, "utf-8");
  return (src.match(/audits\.scoreComposite/g) ?? []).length;
}

describe("no reader uses the raw audits.scoreComposite column for display/sort/alerts", () => {
  it("every raw drizzle reference to audits.scoreComposite in app/lib/inngest/components is in the explicit, justified allowlist above", () => {
    const filesWithRawRef: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const absPath of listSourceFiles(resolve(ROOT, dir))) {
        if (findRawColumnRefs(absPath) > 0) {
          filesWithRawRef.push(relative(ROOT, absPath).replace(/\\/g, "/"));
        }
      }
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
        findRawColumnRefs(resolve(ROOT, file)),
        `${file} no longer references audits.scoreComposite -- remove its stale allowlist entry`,
      ).toBeGreaterThan(0);
    }
  });
});
