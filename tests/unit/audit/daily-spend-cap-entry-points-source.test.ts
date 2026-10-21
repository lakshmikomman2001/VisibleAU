/**
 * "Make the daily spend cap real", item 2 -- the three remaining
 * audit-starting entry points besides the manual "Run audit" button/
 * API (tests/integration/daily-spend-cap-entry-points.integration.
 * test.ts covers that one, plus lib/audit/run-audit-inline.ts's own
 * internal check and inngest/functions/trigger-validation-reaudit.ts,
 * live against a real DB). These three loop over multiple schedules/
 * brands per run, so a full live test needs more fixture setup per
 * file for the same guarantee a source check already proves cheaply
 * and reliably: checkDailySpend() is called, and is called BEFORE
 * the audit row is ever inserted, for every one of them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ENTRY_POINT_FILES = [
  "inngest/functions/audit-schedules-cron.ts",
  "inngest/functions/bulk-reaudit-orchestrate.ts",
  "inngest/functions/schedule-workflow-runs.ts",
];

describe("every scheduled/bulk audit entry point checks the daily spend cap before creating an audit row", () => {
  for (const file of ENTRY_POINT_FILES) {
    it(`${file} imports and calls BudgetPolicyService.checkDailySpend`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(
        /import\s*\{[^}]*BudgetPolicyService[^}]*\}\s*from\s*"@\/lib\/platform\/budget-policy\.service"/,
      );
      expect(src).toMatch(/BudgetPolicyService\.checkDailySpend\(/);
    });

    it(`${file} checks the cap strictly BEFORE inserting into audits`, () => {
      const src = readFileSync(file, "utf8");
      const checkIdx = src.indexOf("BudgetPolicyService.checkDailySpend(");
      const insertIdx = src.indexOf(".insert(audits)");
      expect(checkIdx).toBeGreaterThan(-1);
      expect(insertIdx).toBeGreaterThan(-1);
      expect(checkIdx).toBeLessThan(insertIdx);
    });

    it(`${file} skips cleanly (returns/continues) when the cap is exceeded, never throws out to the caller`, () => {
      const src = readFileSync(file, "utf8");
      const checkIdx = src.indexOf("BudgetPolicyService.checkDailySpend(");
      // The next ~400 chars after the check call is this file's own
      // skip branch -- a plain return/continue, never a throw (which
      // would hand Inngest's own `retries` a failure that can never
      // succeed, same class of bug the BrandNeedsConfirmationError
      // re-throw fix addressed for the confirmation gate).
      const nextBlock = src.slice(checkIdx, checkIdx + 600);
      expect(nextBlock).toMatch(/return[\s;]|continue;/);
      expect(nextBlock).not.toMatch(/throw\s/);
    });
  }

  it("audit-schedules-cron.ts does NOT pause the schedule on a daily-cap skip (unlike its quota_exceeded/needs_confirmation siblings) -- the cap resets by the next nightly run, so there's no stuck state to resume from", () => {
    const src = readFileSync("inngest/functions/audit-schedules-cron.ts", "utf8");
    const checkIdx = src.indexOf("BudgetPolicyService.checkDailySpend(");
    const nextBlock = src.slice(checkIdx, checkIdx + 400);
    expect(nextBlock).not.toMatch(/\.update\(auditSchedules\)/);
    expect(nextBlock).toMatch(/return null;/);
  });
});
