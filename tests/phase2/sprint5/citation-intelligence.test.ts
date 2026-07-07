import { describe, it, expect } from "vitest";
import { computeGapSeverity } from "@/lib/trust/citation-intelligence";

describe("computeGapSeverity — boundary values", () => {
  it(">20 share + brand NOT present → critical", () => {
    expect(computeGapSeverity(21, false)).toBe("critical");
    expect(computeGapSeverity(30, false)).toBe("critical");
    expect(computeGapSeverity(100, false)).toBe("critical");
  });

  it("exactly 20 share + brand NOT present → warning (boundary)", () => {
    expect(computeGapSeverity(20, false)).toBe("warning");
  });

  it("10–19 share + brand NOT present → warning", () => {
    expect(computeGapSeverity(10, false)).toBe("warning");
    expect(computeGapSeverity(15, false)).toBe("warning");
    expect(computeGapSeverity(19, false)).toBe("warning");
  });

  it("<10 share + brand NOT present → opportunity", () => {
    expect(computeGapSeverity(5, false)).toBe("opportunity");
    expect(computeGapSeverity(9, false)).toBe("opportunity");
    expect(computeGapSeverity(9.99, false)).toBe("opportunity");
  });

  it("brand present in source → covered regardless of share", () => {
    expect(computeGapSeverity(50, true)).toBe("covered");
    expect(computeGapSeverity(5, true)).toBe("covered");
    expect(computeGapSeverity(0, true)).toBe("covered");
  });

  it("zero share + not present → opportunity", () => {
    expect(computeGapSeverity(0, false)).toBe("opportunity");
  });

  it("20.01 share + not present → critical (boundary)", () => {
    expect(computeGapSeverity(20.01, false)).toBe("critical");
  });
});
