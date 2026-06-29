import { describe, it, expect } from "vitest";
import {
  deriveConfidenceLabel,
  computePriorityScore,
  rankTasks,
} from "@/lib/workflow/priority-scorer";

describe("priority-scorer — confidence_label derivation", () => {
  it("maps sufficient → High", () => {
    expect(deriveConfidenceLabel("sufficient")).toBe("High");
  });

  it("maps partial → Medium", () => {
    expect(deriveConfidenceLabel("partial")).toBe("Medium");
  });

  it("maps insufficient → Low", () => {
    expect(deriveConfidenceLabel("insufficient")).toBe("Low");
  });

  it("maps pending → null", () => {
    expect(deriveConfidenceLabel("pending")).toBeNull();
  });

  it("maps null → null", () => {
    expect(deriveConfidenceLabel(null)).toBeNull();
  });

  it("maps unknown values → null", () => {
    expect(deriveConfidenceLabel("unknown_value")).toBeNull();
  });
});

describe("priority-scorer — priority ranking", () => {
  it("higher impact × higher confidence ÷ lower effort = higher score", () => {
    const highPriority = computePriorityScore(80, "sufficient", "low");
    const medPriority = computePriorityScore(50, "partial", "medium");
    const lowPriority = computePriorityScore(20, "insufficient", "high");
    expect(highPriority).toBeGreaterThan(medPriority);
    expect(medPriority).toBeGreaterThan(lowPriority);
  });

  it("sufficient weight (1.0) produces higher score than partial (0.7)", () => {
    const sufficient = computePriorityScore(50, "sufficient", "medium");
    const partial = computePriorityScore(50, "partial", "medium");
    expect(sufficient).toBeGreaterThan(partial);
  });

  it("low effort (weight 3) produces higher score than high effort (weight 1)", () => {
    const lowEffort = computePriorityScore(50, "sufficient", "low");
    const highEffort = computePriorityScore(50, "sufficient", "high");
    expect(lowEffort).toBeGreaterThan(highEffort);
  });

  it("pending quality_status uses 0.5 weight", () => {
    const pending = computePriorityScore(60, "pending", "medium");
    expect(pending).toBe(60 * 0.5 * 2);
  });

  it("null quality_status defaults to pending (0.5)", () => {
    const nullStatus = computePriorityScore(60, null, "medium");
    const pending = computePriorityScore(60, "pending", "medium");
    expect(nullStatus).toBe(pending);
  });

  it("rankTasks assigns rank 1 to the highest scoring task", () => {
    const tasks = [
      { id: "a", priorityScore: 10 },
      { id: "b", priorityScore: 50 },
      { id: "c", priorityScore: 30 },
    ];
    const ranks = rankTasks(tasks);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(2);
    expect(ranks.get("a")).toBe(3);
  });

  it("re-rank changes when quality_status updates", () => {
    const before = computePriorityScore(50, "pending", "medium");
    const after = computePriorityScore(50, "sufficient", "medium");
    expect(after).toBeGreaterThan(before);
  });
});

describe("priority-scorer — edge cases & exact formulas", () => {
  it("zero impact produces score 0 regardless of other weights", () => {
    expect(computePriorityScore(0, "sufficient", "low")).toBe(0);
    expect(computePriorityScore(0, "partial", "high")).toBe(0);
    expect(computePriorityScore(0, "insufficient", "medium")).toBe(0);
  });

  it("exact formula: 100 * sufficient(1.0) * low(3) = 300", () => {
    expect(computePriorityScore(100, "sufficient", "low")).toBe(300);
  });

  it("exact formula: 100 * partial(0.7) * medium(2) = 140", () => {
    expect(computePriorityScore(100, "partial", "medium")).toBe(140);
  });

  it("exact formula: 100 * insufficient(0.4) * high(1) = 40", () => {
    expect(computePriorityScore(100, "insufficient", "high")).toBe(40);
  });

  it("exact formula: 100 * pending(0.5) * low(3) = 150", () => {
    expect(computePriorityScore(100, "pending", "low")).toBe(150);
  });

  it("unknown effort defaults to medium weight (2)", () => {
    const unknownEffort = computePriorityScore(50, "sufficient", "unknown_effort");
    const mediumEffort = computePriorityScore(50, "sufficient", "medium");
    expect(unknownEffort).toBe(mediumEffort);
  });

  it("unknown quality_status defaults to pending weight (0.5)", () => {
    const unknownQuality = computePriorityScore(50, "unknown_quality", "medium");
    const pendingQuality = computePriorityScore(50, "pending", "medium");
    expect(unknownQuality).toBe(pendingQuality);
  });

  it("rankTasks with equal scores assigns sequential ranks (stable)", () => {
    const tasks = [
      { id: "a", priorityScore: 50 },
      { id: "b", priorityScore: 50 },
      { id: "c", priorityScore: 50 },
    ];
    const ranks = rankTasks(tasks);
    const values = [...ranks.values()].sort();
    expect(values).toEqual([1, 2, 3]);
  });

  it("rankTasks with empty array returns empty map", () => {
    const ranks = rankTasks([]);
    expect(ranks.size).toBe(0);
  });

  it("rankTasks with single task assigns rank 1", () => {
    const ranks = rankTasks([{ id: "only", priorityScore: 42 }]);
    expect(ranks.get("only")).toBe(1);
  });
});
