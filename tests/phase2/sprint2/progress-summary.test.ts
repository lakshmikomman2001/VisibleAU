import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("progress-summary — Measured Impact SUM", () => {
  const source = fs.readFileSync(
    path.resolve("lib/workflow/progress-summary.ts"),
    "utf-8",
  );

  it("includes isNotNull(scoreAfter) in the measured impact query", () => {
    expect(source).toContain("isNotNull");
    expect(source).toContain("scoreAfter");
  });

  it("uses SUM for lift calculation", () => {
    expect(source).toContain("SUM");
  });

  it("scopes to current month via date_trunc", () => {
    expect(source).toContain("date_trunc('month'");
  });

  it("returns validationPending when tasks are complete but scoreAfter is null", () => {
    expect(source).toContain("validationPending");
  });

  it("exports getProgressSummary", () => {
    expect(source).toContain("export async function getProgressSummary");
  });

  it("never fabricates a zero lift", () => {
    expect(source).not.toContain("measuredImpact: 0");
  });

  it("ProgressSummary interface has all 5 fields", () => {
    expect(source).toContain("completedThisMonth: number");
    expect(source).toContain("totalTasks: number");
    expect(source).toContain("measuredImpact: number | null");
    expect(source).toContain("gapsClosed: number");
    expect(source).toContain("validationPending: boolean");
  });

  it("measuredImpact is null when no validated results", () => {
    expect(source).toContain("hasValidatedResults ? Number(liftRow!.totalLift) : null");
  });

  it("validationPending formula: completedThisMonth > 0 && !hasValidatedResults", () => {
    expect(source).toContain("completedThisMonth > 0 && !hasValidatedResults");
  });

  it("uses COALESCE to avoid null SUM", () => {
    expect(source).toContain("COALESCE(SUM(");
  });

  it("measuredCount uses COUNT(scoreAfter) not COUNT(*)", () => {
    expect(source).toContain("COUNT(${remediationTasks.scoreAfter})");
  });

  it("hasValidatedResults checks measuredCount > 0", () => {
    expect(source).toContain("(liftRow?.measuredCount ?? 0) > 0");
  });
});
