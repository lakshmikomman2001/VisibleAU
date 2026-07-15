import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const loopSource = readFileSync(
  path.resolve("components/domain/autopilot/autopilot-loop.tsx"),
  "utf-8",
);
const stepCardSource = readFileSync(
  path.resolve("components/domain/autopilot/loop-step-card.tsx"),
  "utf-8",
);

describe("Autopilot Loop (5-step + honesty rule + presentational states)", () => {
  it("has exactly 5 steps: Audit, Gap, Explain, Draft, Measure", () => {
    expect(loopSource).toContain("Audit complete");
    expect(loopSource).toContain("#1 gap identified");
    expect(loopSource).toContain("Explanation shown");
    expect(loopSource).toContain("Draft approved");
    expect(loopSource).toContain("Re-audit + measurement");
  });

  it("step sources: gap → topGap/topTask, explain → explainability, draft → content_draft", () => {
    expect(loopSource).toContain("topGap");
    expect(loopSource).toContain("topTask");
    expect(loopSource).toContain("explainability");
    expect(loopSource).toContain("draft");
  });

  it("step.status is presentational ('done'|'current'|'pending'), NOT DB enum", () => {
    expect(stepCardSource).toMatch(/StepStatus.*=.*"done".*"current".*"pending"/);
    expect(stepCardSource).not.toContain("in_progress");
    expect(stepCardSource).not.toContain("ready_for_review");
    expect(stepCardSource).not.toContain("wont_fix");
  });

  describe("S9b-01: Measure step honesty rule", () => {
    it("gates lift display on scoreAfter not-null", () => {
      expect(loopSource).toContain("scoreAfter");
      expect(loopSource).toMatch(/scoreAfter\s*==\s*null|scoreAfter\s*!=\s*null/);
    });

    it("shows 'validation audit scheduled — pending' when scoreAfter is null", () => {
      expect(loopSource).toContain("Validation audit scheduled — pending");
    });

    it("uses lift_achieved for per-fix delta, not overall visibility_trends", () => {
      expect(loopSource).toContain("liftAchieved");
    });

    it("shows flat/negative honestly — not coerced to positive", () => {
      expect(loopSource).toMatch(/lift\s*<\s*0/);
      expect(loopSource).toContain("No measurable change yet");
    });

    it("buildMeasureDescription handles all cases: null, positive, negative, flat", () => {
      expect(loopSource).toContain("Validation audit scheduled — pending");
      expect(loopSource).toContain("Citation rate improved");
      expect(loopSource).toContain("Citation rate changed");
      expect(loopSource).toContain("No measurable change yet");
    });
  });

  it("uses the explainability rationale from S6 annotations (render, not regenerate)", () => {
    expect(loopSource).toContain("explainability?.rationale");
    expect(loopSource).not.toContain("ExplainabilityService");
    expect(loopSource).not.toContain("annotate(");
  });

  it("renders with motion-safe gradient animation", () => {
    expect(loopSource).toContain("motion-safe:animate-gradient-shift");
  });

  it("has aria-live polite region", () => {
    expect(loopSource).toContain('aria-live="polite"');
  });
});
