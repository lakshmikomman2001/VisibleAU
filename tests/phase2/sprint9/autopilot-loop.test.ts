import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

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

  // 17 Nov, part 3: step 5 shows the task's measured change from its own audit to its re-audit (the tasks API's
  // `change`, lib/visibility/audit-change.ts), never lift_achieved (the re-audit minus an expected-impact bucket):
  // "Citation rate improved +X%" was made up.
  describe("S9b-01: Measure step honesty rule", () => {
    it("step 5 is the measured change, or why there isn't one -- never liftAchieved", () => {
      const fn = loopSource.slice(loopSource.indexOf("export function buildMeasureDescription"));
      const body = fn.slice(0, fn.indexOf("\n}\n"));
      expect(body).toContain('change?.kind === "measured"');
      expect(body).toContain("return change.line");
      expect(body).toContain("return change.reason");
      expect(body).not.toMatch(/liftAchieved|Citation rate/);
    });

    it("not re-audited → 'Not re-audited yet'; a re-audit that didn't run → why, in words", () => {
      expect(loopSource).toContain('return "Not re-audited yet"');
      expect(loopSource).toContain(
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the component's source contains this template literal
        "Re-audit not run: ${deferredReasonWords(task.reauditDeferredReason)}",
      );
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
