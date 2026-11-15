import { describe, expect, it } from "vitest";
import {
  type AuditSummary,
  buildMeasureDescription,
  type ContentDraft,
  deriveStepStatus,
  formatGapPriority,
  type RemediationTask,
  resolveStep2Phase,
  step2Status,
  step2Title,
  type TopicalGap,
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
      "current",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("audit without completedAt → step 1 current", () => {
    const incompleteAudit = { ...COMPLETED_AUDIT, completedAt: null };
    expect(deriveStepStatus(incompleteAudit, null, null, null)).toEqual([
      "current",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("⚠️ V: audit complete, no gap, no task → step 2 DONE (resolved to zero), never 'current'", () => {
    // Pre-V, this returned ["done", "current", ...] — a permanent "In progress"
    // badge on a step that had actually finished with nothing to act on. Task
    // V: zero content gaps is a legitimate terminal outcome, not a stall.
    expect(deriveStepStatus(COMPLETED_AUDIT, null, null, null)).toEqual([
      "done",
      "done",
      "pending",
      "pending",
      "pending",
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
      "done",
      "done",
      "current",
      "pending",
      "pending",
    ]);
  });

  it("audit + gap + task (open) → step 3 current", () => {
    expect(deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, BONDI_TASK, null)).toEqual([
      "done",
      "done",
      "current",
      "pending",
      "pending",
    ]);
  });

  it("audit + gap + task (not open) + draft → step 4 current", () => {
    const completedTask = { ...BONDI_TASK, status: "in_progress" };
    expect(
      deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, completedTask, IN_PROGRESS_DRAFT),
    ).toEqual(["done", "done", "done", "current", "pending"]);
  });

  it("+ approved draft, scoreAfter NULL → step 5 current", () => {
    const completedTask = { ...BONDI_TASK, status: "complete" };
    expect(
      deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, completedTask, APPROVED_DRAFT),
    ).toEqual(["done", "done", "done", "done", "current"]);
  });

  it("scoreAfter non-NULL → all 5 done", () => {
    const measuredTask = { ...BONDI_TASK, status: "complete", scoreAfter: 42.5 };
    expect(
      deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, measuredTask, APPROVED_DRAFT),
    ).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("scoreAfter NULL → step 5 never done", () => {
    const pendingTask = { ...BONDI_TASK, status: "complete", scoreAfter: null };
    const result = deriveStepStatus(COMPLETED_AUDIT, METROPOLITAN_GAP, pendingTask, APPROVED_DRAFT);
    expect(result[4]).not.toBe("done");
  });

  it("Task #46 Phase 2: reauditDeferredReason='insufficient_data', scoreAfter NULL → step 5 DONE, not stuck 'current'", () => {
    // Before this fix, a zero-mention re-audit left scoreAfter null forever
    // (by design -- never a fabricated 0), which this function's pre-fix
    // logic read identically to "re-audit hasn't run yet", permanently
    // stalling step 5 on "current" with a "pending" detail panel even
    // though the re-audit genuinely completed.
    const insufficientDataTask = {
      ...BONDI_TASK,
      status: "complete",
      scoreAfter: null,
      liftAchieved: null,
      reauditDeferredReason: "insufficient_data",
    };
    const result = deriveStepStatus(
      COMPLETED_AUDIT,
      METROPOLITAN_GAP,
      insufficientDataTask,
      APPROVED_DRAFT,
    );
    expect(result).toEqual(["done", "done", "done", "done", "done"]);
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
 * ⚠️ V — the step-2 title/status resolver.
 * Pre-V, step 2's title was a hardcoded constant ("#1 gap identified") that
 * stayed on screen even when the description said "No gaps identified yet",
 * and even before the audit it depends on had finished. resolveStep2Phase +
 * step2Title/step2Status replace that constant with three real, testable
 * states.
 */
describe("⚠️ V — resolveStep2Phase / step2Title / step2Status", () => {
  it("loading (fetch not resolved) → 'Scanning for gaps…' / 'current'", () => {
    const phase = resolveStep2Phase(true, null, null);
    expect(phase).toBe("loading");
    expect(step2Title(phase, null)).toBe("Scanning for gaps…");
    expect(step2Status(phase)).toBe("current");
  });

  it("loaded, gap present → title names the gap, status 'current'", () => {
    const phase = resolveStep2Phase(false, METROPOLITAN_GAP, null);
    expect(phase).toBe("found");
    expect(step2Title(phase, METROPOLITAN_GAP)).toBe("#1 gap: Emergency Plumbing");
    expect(step2Status(phase)).toBe("current");
  });

  it("loaded, task stands in for a gap (no topGap) → generic '#1 gap identified', status 'current'", () => {
    const phase = resolveStep2Phase(false, null, BONDI_TASK);
    expect(phase).toBe("found");
    expect(step2Title(phase, null)).toBe("#1 gap identified");
    expect(step2Status(phase)).toBe("current");
  });

  it("loaded, nothing found → 'No content gaps found', status 'done' — never 'current'", () => {
    const phase = resolveStep2Phase(false, null, null);
    expect(phase).toBe("empty");
    const title = step2Title(phase, null);
    const status = step2Status(phase);
    expect(title).toBe("No content gaps found");
    expect(status).not.toBe("current");
    expect(status).toBe("done");
    expect(title).not.toBe("#1 gap identified");
  });
});

describe("⚠️ V — formatGapPriority (never renders 'priority #null')", () => {
  it("a real rank → 'Priority #N'", () => {
    expect(formatGapPriority(1)).toBe("Priority #1");
    expect(formatGapPriority(3)).toBe("Priority #3");
  });

  it("null or undefined rank → an honest fallback, never '#null'", () => {
    expect(formatGapPriority(null)).not.toContain("null");
    expect(formatGapPriority(undefined)).not.toContain("null");
    // 17 Nov, part 2: a state, not a promise ("Priority not yet ranked").
    expect(formatGapPriority(null)).toBe("Not ranked");
  });
});

/**
 * §1.4 — buildMeasureDescription (HONESTY RULE)
 * Canon v8.19/v8.27/v8.32: lift shown ONLY when score_after IS NOT NULL
 */
/**
 * §1.4 -- step 5's line. 17 Nov, part 3: it was built from lift_achieved (the re-audit's Visibility minus
 * score_before, an expected-impact bucket of 80/50/20: "Citation rate improved +7.3% · verified by re-audit"). Now it's
 * the task's measured change from its own audit to its re-audit (the tasks API's `change`, lib/visibility/
 * audit-change.ts), or why there isn't one -- never a stored lift.
 */
describe("§1.4 — buildMeasureDescription (the measured change, never a stored lift)", () => {
  const MEASURED = {
    kind: "measured" as const,
    before: {
      auditId: "a49",
      auditNumber: 49,
      completedAt: null,
      value: "28%",
      counts: "11 of 40",
      shownPercent: 28,
    },
    after: {
      auditId: "a50",
      auditNumber: 50,
      completedAt: null,
      value: "33%",
      counts: "13 of 40",
      shownPercent: 33,
    },
    points: 5,
    direction: "up" as const,
    line: "Audit #49 → #50: 28% (11 of 40) → 33% (13 of 40), up 5 points",
  };

  it("no task → what starts a re-audit", () => {
    expect(buildMeasureDescription(null)).toBe(
      "Mark a task done to have it re-audited 14 days later",
    );
  });

  it("a measured change → its line, with both audits and counts", () => {
    const task: RemediationTask = { ...BONDI_TASK, reauditId: "a50", change: MEASURED };
    expect(buildMeasureDescription(task)).toBe(MEASURED.line);
  });

  it("⚠️ never the stored lift: lift_achieved and score_after are ignored", () => {
    const task: RemediationTask = {
      ...BONDI_TASK,
      scoreAfter: 42.5,
      liftAchieved: 7.3,
      reauditId: "a50",
      change: MEASURED,
    };
    const result = buildMeasureDescription(task);
    expect(result).not.toMatch(/7\.3|42\.5|Citation rate/);
    const unmeasured: RemediationTask = { ...BONDI_TASK, scoreAfter: 42.5, liftAchieved: 7.3 };
    expect(buildMeasureDescription(unmeasured)).toBe("Not re-audited yet");
  });

  it("not comparable → why", () => {
    const task: RemediationTask = {
      ...BONDI_TASK,
      reauditId: "a50",
      change: {
        kind: "not_comparable",
        reason: "Not comparable (questions changed)",
        before: MEASURED.before,
        after: MEASURED.after,
      },
    };
    expect(buildMeasureDescription(task)).toBe("Not comparable (questions changed)");
  });

  it("a re-audit with too few answers → says so, never a number", () => {
    const task: RemediationTask = {
      ...BONDI_TASK,
      reauditId: "a50",
      reauditDeferredReason: "insufficient_data",
      change: { kind: "not_measured", reason: "Not measured: audit #50 had too few answers" },
    };
    expect(buildMeasureDescription(task)).toBe("Not measured: audit #50 had too few answers");
  });

  it("a re-audit that didn't run → why, in words", () => {
    const task: RemediationTask = {
      ...BONDI_TASK,
      reauditDeferredReason: "daily_spend_cap_exceeded",
    };
    expect(buildMeasureDescription(task)).toBe(
      "Re-audit not run: the daily spend limit was reached",
    );
  });

  it("no re-audit yet → 'Not re-audited yet', never 'pending' or a zero", () => {
    const result = buildMeasureDescription({ ...BONDI_TASK, scoreAfter: null, liftAchieved: null });
    expect(result).toBe("Not re-audited yet");
    expect(result).not.toMatch(/\d|pending/);
  });
});
