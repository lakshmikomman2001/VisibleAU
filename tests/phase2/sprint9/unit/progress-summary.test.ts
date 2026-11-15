import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * §1.5 -- the Autopilot tracker's query (lib/workflow/progress-summary.ts).
 *
 * 17 Nov, part 3 (Sri: every page must agree with the audit): the canon's "MEASURED IMPACT = SUM(lift_achieved)" was
 * a made-up figure -- lift_achieved was the re-audit's Visibility minus score_before, and score_before is a
 * recommendation's expected-impact bucket (80/50/20), never a measurement. The mock-db tests that pinned that sum
 * are gone; the summary's behaviour is tested against a real database in
 * tests/integration/measured-change.integration.test.tsx. What stays here is the source contract.
 */
describe("§1.5 -- getProgressSummary: source contract", () => {
  const source = readFileSync("lib/workflow/progress-summary.ts", "utf8");

  it("⚠️ F1: the month is by completedAt (not updatedAt)", () => {
    expect(source).toContain("gte(remediationTasks.completedAt, start)");
    expect(source).not.toMatch(/gte\(remediationTasks\.updatedAt/);
  });

  it("the month is the workspace's own (Sydney time, as the dashboard's other cards), not the UTC month", () => {
    expect(source).toContain("monthInTzSql(getOrgTimezone(organizationId), now)");
    expect(source).not.toContain("AT TIME ZONE 'UTC'");
  });

  it("uses status='complete' (no -d) in the filter", () => {
    expect(source).toContain('"complete"');
    expect(source).not.toContain('"completed"');
  });

  it("a re-audit's change is measured between the task's own audit and its re-audit, never from score_before or lift_achieved", () => {
    expect(source).toContain("auditChanges(");
    expect(source).toContain("beforeId: t.auditId, afterId: t.reauditId");
    expect(source).not.toContain("remediationTasks.liftAchieved");
    expect(source).not.toContain("remediationTasks.scoreBefore");
    expect(source).not.toContain("visibilityTrends");
  });

  it("no 'N of every task ever' ratio: done this month and still open are separate figures", () => {
    expect(source).toContain("openTasks");
    expect(source).toContain('OPEN_STATUSES = ["open", "in_progress", "ready_for_review"]');
  });
});
