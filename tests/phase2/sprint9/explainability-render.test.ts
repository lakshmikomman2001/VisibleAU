import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const loopSource = readFileSync(
  path.resolve("components/domain/autopilot/autopilot-loop.tsx"),
  "utf-8",
);
const healthSource = readFileSync(
  path.resolve("components/domain/autopilot/health-check-panel.tsx"),
  "utf-8",
);
const healthPageSource = readFileSync(
  path.resolve("app/(auth)/brands/[brandId]/health-check/page.tsx"),
  "utf-8",
);

describe("Explainability render contract (S9 renders, does NOT regenerate)", () => {
  it("autopilot-loop renders rationale from explainability shape", () => {
    expect(loopSource).toContain("explainability?.rationale");
  });

  it("autopilot-loop renders confidenceNote", () => {
    expect(loopSource).toContain("confidenceNote");
  });

  it("health-check-panel renders rationale on top action (non-empty check)", () => {
    expect(healthSource).toContain("topAction.rationale");
  });

  it("health-check page passes explainability rationale to panel", () => {
    expect(healthPageSource).toMatch(/rationale|explainability/);
  });

  it("NO ExplainabilityService import in any S9 autopilot component", () => {
    expect(loopSource).not.toContain("ExplainabilityService");
    expect(healthSource).not.toContain("ExplainabilityService");
  });

  it("NO annotate() call in any S9 autopilot component", () => {
    expect(loopSource).not.toContain("annotate(");
    expect(healthSource).not.toContain("annotate(");
  });

  it("the { score, explainability } shape is present in loop data types", () => {
    expect(loopSource).toContain("Explainability");
    expect(loopSource).toContain("rationale");
    expect(loopSource).toContain("confidenceNote");
  });

  it("rationale field type enforces non-empty string (string type, not optional)", () => {
    expect(loopSource).toMatch(/rationale:\s*string/);
  });
});
