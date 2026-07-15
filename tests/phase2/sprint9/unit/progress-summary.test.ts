import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

/**
 * §1.5 — The canonical tracker query (lib/workflow/progress-summary.ts)
 * Canon LLD 7895–7931:
 *   WORK COMPLETED  = COUNT(*) WHERE status='complete' AND completed_at in UTC month
 *   MEASURED IMPACT  = COALESCE(SUM(lift_achieved) WHERE score_after IS NOT NULL AND same month, 0)
 *
 * The function accepts a db/tx param (F22 fix). Tests pass a mock db directly.
 */

type MockSelectReturn = { value?: number; totalLift?: number; measuredCount?: number };

function createMockDb(responses: MockSelectReturn[]) {
  let callIndex = 0;
  const mockSelect = vi.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? { value: 0 };
    callIndex++;
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([response]),
      }),
    };
  });
  return { select: mockSelect } as unknown as Parameters<typeof getProgressSummary>[1];
}

vi.mock("@/db/client", () => ({
  serviceDb: {},
  db: {},
  withRlsContext: vi.fn(),
}));

import { getProgressSummary } from "@/lib/workflow/progress-summary";

describe("§1.5 — getProgressSummary (canonical tracker query)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct shape with zero tasks", async () => {
    const db = createMockDb([
      { value: 0 },  // completedThisMonth
      { value: 0 },  // totalTasks
      { totalLift: 0, measuredCount: 0 },  // lift
      { value: 0 },  // gapsClosed
    ]);
    const result = await getProgressSummary("brand-1", db);
    expect(result).toEqual({
      completedThisMonth: 0,
      totalTasks: 0,
      measuredImpact: null,
      gapsClosed: 0,
      validationPending: false,
    });
  });

  it("Bondi real state: 1 open task, 0 complete → '0 / 1 gaps closed'", async () => {
    const db = createMockDb([
      { value: 0 },  // completedThisMonth = 0
      { value: 1 },  // totalTasks = 1
      { totalLift: 0, measuredCount: 0 },  // no measured
      { value: 0 },  // gapsClosed (complete count overall) = 0
    ]);
    const result = await getProgressSummary("bondi-brand", db);
    expect(result.completedThisMonth).toBe(0);
    expect(result.totalTasks).toBe(1);
    expect(result.measuredImpact).toBeNull();
    expect(result.validationPending).toBe(false);
  });

  it("completed tasks with measured impact", async () => {
    const db = createMockDb([
      { value: 2 },  // completedThisMonth
      { value: 5 },  // totalTasks
      { totalLift: 12.5, measuredCount: 2 },  // lift
      { value: 3 },  // gapsClosed
    ]);
    const result = await getProgressSummary("brand-1", db);
    expect(result.completedThisMonth).toBe(2);
    expect(result.totalTasks).toBe(5);
    expect(result.measuredImpact).toBe(12.5);
    expect(result.gapsClosed).toBe(3);
    expect(result.validationPending).toBe(false);
  });

  it("completed tasks WITHOUT measured impact → validationPending=true", async () => {
    const db = createMockDb([
      { value: 1 },  // completedThisMonth > 0
      { value: 3 },  // totalTasks
      { totalLift: 0, measuredCount: 0 },  // no measured results
      { value: 1 },  // gapsClosed
    ]);
    const result = await getProgressSummary("brand-1", db);
    expect(result.completedThisMonth).toBe(1);
    expect(result.measuredImpact).toBeNull();
    expect(result.validationPending).toBe(true);
  });

  it("COALESCE: no rows → measuredImpact is null, not undefined", async () => {
    const db = createMockDb([
      { value: 0 },
      { value: 0 },
      { totalLift: 0, measuredCount: 0 },
      { value: 0 },
    ]);
    const result = await getProgressSummary("brand-1", db);
    expect(result.measuredImpact).toBeNull();
    expect(result.measuredImpact).not.toBeUndefined();
  });

  describe("⚠️ source-level contract assertions (break-proven via grep)", () => {
    const source = readFileSync("lib/workflow/progress-summary.ts", "utf8");

    it("⚠️ F1: uses completedAt (not updatedAt) for month filter", () => {
      expect(source).toContain("remediationTasks.completedAt, monthStart");
      expect(source).not.toMatch(/gte\(remediationTasks\.updatedAt,\s*monthStart\)/);
    });

    it("⚠️ F2/F21: uses date_trunc with explicit UTC (not server TZ)", () => {
      expect(source).toContain("date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");
      expect(source).not.toMatch(/date_trunc\('month',\s*now\(\)\s*\)`/);
      expect(source).not.toMatch(/new Date\(\)|getMonth\(\)|startOfMonth/);
    });

    it("uses status='complete' (no -d) in the filter", () => {
      expect(source).toContain('"complete"');
      expect(source).not.toContain('"completed"');
    });

    it("⚠️ F3: measured impact uses liftAchieved (not visibility_trends)", () => {
      expect(source).toContain("remediationTasks.liftAchieved");
      expect(source).not.toContain("visibilityTrends");
      expect(source).not.toContain("visibility_trends");
    });
  });
});
