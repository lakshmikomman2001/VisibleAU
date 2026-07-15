import { describe, it, expect } from "vitest";
import {
  deriveStepStatus,
  buildMeasureDescription,
  type AuditSummary,
  type TopicalGap,
  type RemediationTask,
  type ContentDraft,
} from "@/components/domain/autopilot/autopilot-loop";

/**
 * §1.3 — deriveStepStatus (F17's function)
 * Canon §6U.2: 5 steps — Monitor → Explain → Prioritize → Execute → Measure
 * Statuses: done | current | pending
 */

const COMPLETED_AUDIT: AuditSummary = {
  scoreComposite: 40.5,
  engineCount: 4,
  promptsCount: 20,
  completedAt: "2026-06-15T10:00:00Z",
};

const BONDI_TASK: RemediationTask = {
  id: "task-1",
  title: "Update local directory listings",
  status: "open",
  priority: 1,
  scoreBefore: 23.67,
  scoreAfter: null,
  liftAchieved: null,
  completedAt: null,
  updatedAt: "2026-06-15T10:00:00Z",
};

const METROPOLITAN_GAP: TopicalGap = {
  topicCluster: "plumbing_emergency",
  topicLabel: "Emergency Plumbing",
  estimatedCitationImpact: 15.0,
  priorityRank: 1,
};

const APPROVED_DRAFT: ContentDraft = {
  id: "draft-1",
  title: "Emergency Plumbing Response Guide",
  status: "approved",
  approvedAt: "2026-06-20T08:00:00Z",
};

const IN_PROGRESS_DRAFT: ContentDraft = {
  id: "draft-2",
  title: "Draft in progress",
  status: "draft",
  approvedAt: null,
};

describe("§1.3 — deriveStepStatus (F17 fix)", () => {
  it("no audit → step 1 current, rest pending", () => {
    expect(deriveStepStatus(null, null, null, null)).toEqual([
      "current", "pending", "pending", "pending", "pending",
    ]);
  });

  it("audit without completedAt → step 1 current", () => {
    const incompleteAudit = { ...COMPLETED_AUDIT, completedAt: null };
    expect(deriveStepStatus(incompleteAudit, null, null, null)).toEqual([
      "current", "pending", "pending", "pending", "pending",
    ]);
  });

  it("audit complete, no gap, no task → honest stall at step 2 (Metropolitan)", () => {
    expect(deriveStepStatus(COMPLETED_AUDIT, null, null, null)).toEqual([
      "done", "current", "pending", "pending", "pending",
    ]);
  });

  it("⚠️ F17: audit + task, NO gap → step 2 DONE, loop ADVANCES to step 3", () => {
    // This is the F17 fix. Pre-fix code was: if (!topGap) return [...stall]
    // A task alone must advance past step 2.
    const result = deriveStepStatus(COMPLETED_AUDIT, null, BONDI_TASK, null);
    expect(result[0]).toBe("done");
    expect(result[1]).toBe("done"); // ← The critical assertion: step 2 is DONE
    expect(result[2]).toBe("current"); // step 3 is current
  });

  it("audit + gap, no task → step 2 done, step 3 current", () => {
    expect(deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, null, null)).toEqual([
      "done", "done", "current", "pending", "pending",
    ]);
  });

  it("audit + gap + task (open) → step 3 current", () => {
    expect(deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, BONDI_TASK, null)).toEqual([
      "done", "done", "current", "pending", "pending",
    ]);
  });

  it("audit + gap + task (not open) + draft → step 4 current", () => {
    const completedTask = { ...BONDI_TASK, status: "in_progress" };
    expect(deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, completedTask, IN_PROGRESS_DRAFT)).toEqual([
      "done", "done", "done", "current", "pending",
    ]);
  });

  it("+ approved draft, scoreAfter NULL → step 5 current", () => {
    const completedTask = { ...BONDI_TASK, status: "complete" };
    expect(deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, completedTask, APPROVED_DRAFT)).toEqual([
      "done", "done", "done", "done", "current",
    ]);
  });

  it("scoreAfter non-NULL → all 5 done", () => {
    const measuredTask = { ...BONDI_TASK, status: "complete", scoreAfter: 42.5 };
    expect(deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, measuredTask, APPROVED_DRAFT)).toEqual([
      "done", "done", "done", "done", "done",
    ]);
  });

  it("scoreAfter NULL → step 5 never done", () => {
    const pendingTask = { ...BONDI_TASK, status: "complete", scoreAfter: null };
    const result = deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, pendingTask, APPROVED_DRAFT);
    expect(result[4]).not.toBe("done");
  });

  it("only 3 valid status values returned", () => {
    const allStatuses = new Set<string>();
    const cases = [
      deriveStepStatus(null, null, null, null),
      deriveStepStatus(COMPLETED_AUDIT, null, null, null),
      deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, BONDI_TASK, APPROVED_DRAFT),
    ];
    cases.forEach((c) => c.forEach((s) => allStatuses.add(s)));
    for (const s of allStatuses) {
      expect(["done", "current", "pending"]).toContain(s);
    }
  });
});

/**
 * §1.4 — buildMeasureDescription (HONESTY RULE)
 * Canon v8.19/v8.27/v8.32: lift shown ONLY when score_after IS NOT NULL
 */
describe("§1.4 — buildMeasureDescription (honesty rule)", () => {
  it("no task → pending description", () => {
    const result = buildMeasureDescription(null);
    expect(result).toContain("re-audit");
  });

  it("⚠️ score_after NULL → pending string, NEVER a zero or blank", () => {
    const task: RemediationTask = {
      ...BONDI_TASK,
      status: "complete",
      scoreAfter: null,
      liftAchieved: null,
    };
    const result = buildMeasureDescription(task);
    expect(result).toContain("pending");
    expect(result).not.toContain("0.0");
    expect(result).not.toContain("+0");
    expect(result).not.toBe("");
    expect(result).not.toMatch(/\b0\b/);
  });

  it("score_after=42.5, lift_achieved=7.3 → shows 7.3 (lift_achieved)", () => {
    const task: RemediationTask = {
      ...BONDI_TASK,
      status: "complete",
      scoreAfter: 42.5,
      liftAchieved: 7.3,
    };
    const result = buildMeasureDescription(task);
    expect(result).toContain("7.3");
    expect(result).toContain("+");
  });

  it("score_after present but lift_achieved NULL → uses 0 fallback", () => {
    // Canon says pending, but implementation falls through to lift=0 branch.
    // Documenting actual behavior — this may be a finding.
    const task: RemediationTask = {
      ...BONDI_TASK,
      status: "complete",
      scoreAfter: 42.5,
      liftAchieved: null,
    };
    const result = buildMeasureDescription(task);
    // lift = Number(null ?? 0) = 0 → "No measurable change yet"
    expect(result).toContain("No measurable change");
  });

  it("lift_achieved=0 with score_after non-NULL → honest measured zero", () => {
    const task: RemediationTask = {
      ...BONDI_TASK,
      status: "complete",
      scoreAfter: 42.5,
      liftAchieved: 0,
    };
    const result = buildMeasureDescription(task);
    expect(result).toContain("No measurable change");
  });

  it("measured zero vs unmeasured pending render DIFFERENTLY", () => {
    const measuredZero: RemediationTask = {
      ...BONDI_TASK,
      status: "complete",
      scoreAfter: 42.5,
      liftAchieved: 0,
    };
    const unmeasured: RemediationTask = {
      ...BONDI_TASK,
      status: "complete",
      scoreAfter: null,
      liftAchieved: null,
    };
    const resultMeasured = buildMeasureDescription(measuredZero);
    const resultUnmeasured = buildMeasureDescription(unmeasured);
    expect(resultMeasured).not.toBe(resultUnmeasured);
  });

  it("negative lift renders correctly", () => {
    const task: RemediationTask = {
      ...BONDI_TASK,
      status: "complete",
      scoreAfter: 38.0,
      liftAchieved: -2.5,
    };
    const result = buildMeasureDescription(task);
    expect(result).toContain("-2.5");
  });

  it("system-wide truth: all real tasks have score_after=NULL → pending path fires", () => {
    // Every remediation_task currently has score_after = NULL
    // This documents that the pending path is what actually renders
    const task: RemediationTask = {
      ...BONDI_TASK,
      status: "open",
      scoreAfter: null,
      liftAchieved: null,
    };
    const result = buildMeasureDescription(task);
    expect(result).toContain("pending");
  });
});
