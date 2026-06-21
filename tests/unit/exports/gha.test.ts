import { describe, expect, it } from "vitest";
import { buildGha } from "@/lib/exports/gha";

describe("buildGha", () => {
  it("emits ::error for scores < 30", () => {
    const output = buildGha({ scores: { frequency: 15 } });
    expect(output).toContain("::error title=Frequency Score::15/100");
  });

  it("emits ::warning for scores 30–49", () => {
    const output = buildGha({ scores: { frequency: 45 } });
    expect(output).toContain("::warning title=Frequency Score::45/100");
  });

  it("emits ::notice for scores 50–69", () => {
    const output = buildGha({ scores: { frequency: 60 } });
    expect(output).toContain("::notice title=Frequency Score::60/100");
  });

  it("silent for scores >= 70", () => {
    const output = buildGha({ scores: { frequency: 75, position: 90, sentiment: 80, context: 85, accuracy: 70 } });
    expect(output).toBe("");
  });

  it("multiple annotations for multiple failing dimensions", () => {
    const output = buildGha({
      scores: { frequency: 10, position: 40, sentiment: 55, context: 80, accuracy: 25 },
    });
    const lines = output.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("::error");
    expect(lines[1]).toContain("::warning");
    expect(lines[2]).toContain("::notice");
    expect(lines[3]).toContain("::error");
  });

  it("boundary: score = 30 is warning", () => {
    const output = buildGha({ scores: { frequency: 30 } });
    expect(output).toContain("::warning");
  });

  it("boundary: score = 50 is notice", () => {
    const output = buildGha({ scores: { frequency: 50 } });
    expect(output).toContain("::notice");
  });

  it("boundary: score = 70 is silent", () => {
    const output = buildGha({ scores: { frequency: 70, position: 70, sentiment: 70, context: 70, accuracy: 70 } });
    expect(output).toBe("");
  });
});
