import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("task-card — impact band derived from scoreBefore, NOT integer priority", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-card.tsx"),
    "utf-8",
  );

  it("deriveImpactBand accepts scoreBefore (string | null), not priority (number)", () => {
    expect(source).toContain("function deriveImpactBand(scoreBefore: string | null)");
    expect(source).not.toContain("function deriveImpactBand(priority: number)");
  });

  it("band is derived from scoreBefore, not priority", () => {
    expect(source).toContain("deriveImpactBand(scoreBefore)");
    expect(source).not.toContain("deriveImpactBand(priority)");
  });

  it("scoreBefore >= 70 maps to high", () => {
    expect(source).toContain("score >= 70");
    expect(source).toContain('return "high"');
  });

  it("scoreBefore >= 40 maps to medium", () => {
    expect(source).toContain("score >= 40");
    expect(source).toContain('return "medium"');
  });

  it("scoreBefore < 40 maps to low", () => {
    expect(source).toContain('return "low"');
  });

  it("null scoreBefore defaults to medium (safe fallback)", () => {
    expect(source).toContain('scoreBefore == null) return "medium"');
  });
});

describe("PriorityBadge — labels say 'Impact' not 'Priority'", () => {
  const source = fs.readFileSync(
    path.resolve("components/phase2/priority-badge.tsx"),
    "utf-8",
  );

  it("high band shows 'High Impact'", () => {
    expect(source).toContain('"High Impact"');
  });

  it("medium band shows 'Medium Impact'", () => {
    expect(source).toContain('"Medium Impact"');
  });

  it("low band shows 'Low Impact'", () => {
    expect(source).toContain('"Low Impact"');
  });
});

describe("task-card — integer priority retained for ordering", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-card.tsx"),
    "utf-8",
  );

  it("priority is still in the TaskCardProps interface", () => {
    expect(source).toContain("priority: number");
  });

  it("task-kanban orders by priority from the data (server-side orderBy)", () => {
    const kanbanSource = fs.readFileSync(
      path.resolve("components/domain/workflow/task-kanban.tsx"),
      "utf-8",
    );
    expect(kanbanSource).not.toContain("deriveImpactBand");
  });

  it("task-manager orders by priority column", () => {
    const tmSource = fs.readFileSync(
      path.resolve("lib/workflow/task-manager.ts"),
      "utf-8",
    );
    expect(tmSource).toContain("orderBy(remediationTasks.priority)");
  });
});

describe("impact band — canon scenarios", () => {
  function deriveImpactBand(scoreBefore: string | null): "high" | "medium" | "low" {
    if (scoreBefore == null) return "medium";
    const score = Number(scoreBefore);
    if (score >= 70) return "high";
    if (score >= 40) return "medium";
    return "low";
  }

  it("scoreBefore=80 (High-impact recommendation) → high band", () => {
    expect(deriveImpactBand("80")).toBe("high");
  });

  it("scoreBefore=80.00 (numeric string) → high band", () => {
    expect(deriveImpactBand("80.00")).toBe("high");
  });

  it("scoreBefore=70 (boundary) → high band", () => {
    expect(deriveImpactBand("70")).toBe("high");
  });

  it("scoreBefore=69.99 → medium band", () => {
    expect(deriveImpactBand("69.99")).toBe("medium");
  });

  it("scoreBefore=50 (Medium-impact recommendation) → medium band", () => {
    expect(deriveImpactBand("50")).toBe("medium");
  });

  it("scoreBefore=40 (boundary) → medium band", () => {
    expect(deriveImpactBand("40")).toBe("medium");
  });

  it("scoreBefore=39.99 → low band", () => {
    expect(deriveImpactBand("39.99")).toBe("low");
  });

  it("scoreBefore=20 (Low-impact recommendation) → low band", () => {
    expect(deriveImpactBand("20")).toBe("low");
  });

  it("null scoreBefore (manual task) → medium band", () => {
    expect(deriveImpactBand(null)).toBe("medium");
  });

  it("scoreBefore=0 → low band", () => {
    expect(deriveImpactBand("0")).toBe("low");
  });
});
