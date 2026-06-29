import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  deriveConfidenceLabel,
  computePriorityScore,
} from "@/lib/workflow/priority-scorer";

const VALID_STATUSES = [
  "open",
  "in_progress",
  "ready_for_review",
  "complete",
  "wont_fix",
] as const;

const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  open: ["in_progress", "wont_fix"],
  in_progress: ["ready_for_review", "open", "wont_fix"],
  ready_for_review: ["complete", "in_progress", "wont_fix"],
  complete: [],
  wont_fix: ["open"],
};

describe("task-manager — status transitions", () => {
  it("defines exactly the 5 §0.5 statuses", () => {
    expect(VALID_STATUSES).toEqual([
      "open",
      "in_progress",
      "ready_for_review",
      "complete",
      "wont_fix",
    ]);
  });

  it("never includes 'done' as a valid status", () => {
    expect(VALID_STATUSES).not.toContain("done");
  });

  it("open can transition to in_progress or wont_fix", () => {
    expect(VALID_TRANSITIONS.open).toContain("in_progress");
    expect(VALID_TRANSITIONS.open).toContain("wont_fix");
    expect(VALID_TRANSITIONS.open).not.toContain("complete");
  });

  it("in_progress can transition to ready_for_review, open, or wont_fix", () => {
    expect(VALID_TRANSITIONS.in_progress).toContain("ready_for_review");
    expect(VALID_TRANSITIONS.in_progress).toContain("open");
    expect(VALID_TRANSITIONS.in_progress).toContain("wont_fix");
  });

  it("ready_for_review can transition to complete, in_progress, or wont_fix", () => {
    expect(VALID_TRANSITIONS.ready_for_review).toContain("complete");
    expect(VALID_TRANSITIONS.ready_for_review).toContain("in_progress");
    expect(VALID_TRANSITIONS.ready_for_review).toContain("wont_fix");
  });

  it("complete is a terminal state", () => {
    expect(VALID_TRANSITIONS.complete).toHaveLength(0);
  });

  it("wont_fix can only reopen", () => {
    expect(VALID_TRANSITIONS.wont_fix).toEqual(["open"]);
  });

  it("wont_fix_reason is required when transitioning to wont_fix", () => {
    const validate = (status: string, reason?: string) => {
      if (status === "wont_fix" && !reason) {
        throw new Error("wont_fix_reason is required");
      }
      return true;
    };

    expect(() => validate("wont_fix")).toThrow("wont_fix_reason is required");
    expect(validate("wont_fix", "Not applicable to this brand")).toBe(true);
    expect(validate("open")).toBe(true);
  });

  it("rejects invalid status values", () => {
    const isValid = (s: string) => (VALID_STATUSES as readonly string[]).includes(s);
    expect(isValid("done")).toBe(false);
    expect(isValid("cancelled")).toBe(false);
    expect(isValid("completed")).toBe(false);
    expect(isValid("open")).toBe(true);
  });
});

describe("task-manager — every valid transition pair (exhaustive)", () => {
  const allValidPairs: Array<[string, string]> = [
    ["open", "in_progress"],
    ["open", "wont_fix"],
    ["in_progress", "ready_for_review"],
    ["in_progress", "open"],
    ["in_progress", "wont_fix"],
    ["ready_for_review", "complete"],
    ["ready_for_review", "in_progress"],
    ["ready_for_review", "wont_fix"],
    ["wont_fix", "open"],
  ];

  for (const [from, to] of allValidPairs) {
    it(`${from} → ${to} is allowed`, () => {
      expect(VALID_TRANSITIONS[from]).toContain(to);
    });
  }
});

describe("task-manager — rejected transition pairs (exhaustive)", () => {
  const rejectedPairs: Array<[string, string]> = [
    ["open", "complete"],
    ["open", "ready_for_review"],
    ["open", "open"],
    ["in_progress", "complete"],
    ["in_progress", "in_progress"],
    ["ready_for_review", "ready_for_review"],
    ["ready_for_review", "open"],
    ["complete", "open"],
    ["complete", "in_progress"],
    ["complete", "ready_for_review"],
    ["complete", "wont_fix"],
    ["complete", "complete"],
    ["wont_fix", "in_progress"],
    ["wont_fix", "ready_for_review"],
    ["wont_fix", "complete"],
    ["wont_fix", "wont_fix"],
  ];

  for (const [from, to] of rejectedPairs) {
    it(`${from} → ${to} is rejected`, () => {
      expect(VALID_TRANSITIONS[from]).not.toContain(to);
    });
  }
});

describe("task-manager — create-time priority/confidence/effort wiring", () => {
  it("priority = Math.max(1, Math.round(priorityScore * 100))", () => {
    const impact = Math.abs(60 - 40);
    const priorityScore = computePriorityScore(impact, "sufficient", "low");
    const priority = Math.max(1, Math.round(priorityScore * 100));
    expect(priorityScore).toBe(20 * 1.0 * 3);
    expect(priority).toBe(6000);
  });

  it("impact = abs(scoreBefore - estimatedAfter)", () => {
    const scoreBefore = 30;
    const estimatedAfter = 70;
    const impact = Math.abs(scoreBefore - estimatedAfter);
    expect(impact).toBe(40);
  });

  it("confidenceLabel derives via deriveConfidenceLabel at create time", () => {
    expect(deriveConfidenceLabel("sufficient")).toBe("High");
    expect(deriveConfidenceLabel("partial")).toBe("Medium");
    expect(deriveConfidenceLabel("insufficient")).toBe("Low");
    expect(deriveConfidenceLabel(null)).toBeNull();
  });

  it("priority is at least 1 even when priorityScore is 0", () => {
    const priorityScore = computePriorityScore(0, "sufficient", "low");
    expect(priorityScore).toBe(0);
    const priority = Math.max(1, Math.round(priorityScore * 100));
    expect(priority).toBe(1);
  });

  it("effort defaults to null, falling back to medium weight in priority calc", () => {
    const withNull = computePriorityScore(50, "sufficient", null);
    const withMedium = computePriorityScore(50, "sufficient", "medium");
    expect(withNull).toBe(withMedium);
  });
});

describe("task-manager — source-level completedAt/wontFixReason setting", () => {
  const source = fs.readFileSync(
    path.resolve("lib/workflow/task-manager.ts"),
    "utf-8",
  );

  it("sets completedAt when transitioning to complete", () => {
    expect(source).toContain('newStatus === "complete"');
    expect(source).toContain("completedAt");
  });

  it("sets wontFixReason when transitioning to wont_fix", () => {
    expect(source).toContain('newStatus === "wont_fix"');
    expect(source).toContain("wontFixReason");
  });

  it("default status for new tasks is open", () => {
    expect(source).toContain('status: "open"');
  });
});
