import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * progress-summary -- the Autopilot tracker's figures.
 *
 * 17 Nov, part 3 (Sri: every page must agree with the audit): the "Measured Impact SUM" these tests pinned was
 * SUM(lift_achieved), and lift_achieved was the re-audit minus score_before -- a recommendation's expected-impact
 * bucket (80/50/20), not a measurement. The summary now counts each re-audited task's measured change between its
 * own audit and its re-audit (lib/visibility/audit-change.ts). Its behaviour against a real database is in
 * tests/integration/brand-pages-agree-with-audit.integration.test.tsx.
 */
describe("progress-summary — measured re-audits, never a sum of lifts", () => {
  const source = fs.readFileSync(path.resolve("lib/workflow/progress-summary.ts"), "utf-8");

  it("exports getProgressSummary", () => {
    expect(source).toContain("export async function getProgressSummary");
  });

  it("no SUM of lifts and no measuredImpact (in the code; the comment says why they're gone)", () => {
    const code = source.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/SUM\(|liftAchieved|measuredImpact/);
  });

  it("each re-audited task is measured from its own audit to its re-audit", () => {
    expect(source).toContain("isNotNull(remediationTasks.reauditId)");
    expect(source).toContain("beforeId: t.auditId, afterId: t.reauditId");
  });

  it("counts how many went up, down or stayed, and keeps the latest change in full", () => {
    expect(source).toContain("reaudits[change.direction]++");
    expect(source).toContain("reaudits.latest ??= change.line");
  });

  it("never fabricates a measured re-audit: a not-comparable one is counted apart", () => {
    expect(source).toContain('change?.kind === "not_comparable"');
  });

  it("the ProgressSummary fields", () => {
    expect(source).toContain("completedThisMonth: number");
    expect(source).toContain("openTasks: number");
    expect(source).toContain("totalTasks: number");
    expect(source).toContain("reaudits: ReauditSummary");
    expect(source).toContain("awaitingReaudit: number");
    expect(source).toContain("gapsClosed: number");
  });
});
