import { describe, expect, it } from "vitest";
import { ciOverlaps, classifySeverity } from "@/lib/drift/significance";

describe("ciOverlaps", () => {
  it("identical CIs overlap", () => {
    expect(ciOverlaps({ lower: 20, upper: 40 }, { lower: 20, upper: 40 })).toBe(true);
  });

  it("fully overlapping CIs", () => {
    expect(ciOverlaps({ lower: 10, upper: 50 }, { lower: 20, upper: 40 })).toBe(true);
  });

  it("partially overlapping CIs", () => {
    expect(ciOverlaps({ lower: 10, upper: 30 }, { lower: 25, upper: 50 })).toBe(true);
  });

  it("non-overlapping CIs — A below B", () => {
    expect(ciOverlaps({ lower: 10, upper: 20 }, { lower: 30, upper: 50 })).toBe(false);
  });

  it("non-overlapping CIs — A above B", () => {
    expect(ciOverlaps({ lower: 60, upper: 80 }, { lower: 10, upper: 40 })).toBe(false);
  });

  it("touching at boundary overlaps", () => {
    expect(ciOverlaps({ lower: 10, upper: 30 }, { lower: 30, upper: 50 })).toBe(true);
  });

  it("zero-width CI at same point", () => {
    expect(ciOverlaps({ lower: 50, upper: 50 }, { lower: 50, upper: 50 })).toBe(true);
  });

  it("zero-width CI within range", () => {
    expect(ciOverlaps({ lower: 30, upper: 30 }, { lower: 20, upper: 40 })).toBe(true);
  });

  it("zero-width CI outside range", () => {
    expect(ciOverlaps({ lower: 10, upper: 10 }, { lower: 20, upper: 40 })).toBe(false);
  });

  it("wide CIs always overlap", () => {
    expect(ciOverlaps({ lower: 0, upper: 100 }, { lower: 0, upper: 100 })).toBe(true);
  });

  it("wide CI and narrow CI overlap", () => {
    expect(ciOverlaps({ lower: 0, upper: 100 }, { lower: 45, upper: 55 })).toBe(true);
  });

  it("adjacent non-touching CIs don't overlap", () => {
    expect(ciOverlaps({ lower: 10, upper: 19.9 }, { lower: 20, upper: 30 })).toBe(false);
  });
});

describe("classifySeverity", () => {
  it("overlapping CIs → within_noise regardless of score delta", () => {
    expect(
      classifySeverity(30, 60, { lower: 20, upper: 50 }, { lower: 40, upper: 70 }),
    ).toBe("within_noise");
  });

  it("non-overlapping CIs + current < previous → significant_drop", () => {
    expect(
      classifySeverity(20, 60, { lower: 10, upper: 30 }, { lower: 50, upper: 70 }),
    ).toBe("significant_drop");
  });

  it("non-overlapping CIs + current > previous → significant_rise", () => {
    expect(
      classifySeverity(70, 30, { lower: 60, upper: 80 }, { lower: 20, upper: 40 }),
    ).toBe("significant_rise");
  });

  it("non-overlapping CIs + equal scores → significant_rise (>= comparison)", () => {
    expect(
      classifySeverity(50, 50, { lower: 45, upper: 55 }, { lower: 30, upper: 40 }),
    ).toBe("significant_rise");
  });

  it("wide CIs always within_noise", () => {
    expect(
      classifySeverity(10, 90, { lower: 0, upper: 100 }, { lower: 0, upper: 100 }),
    ).toBe("within_noise");
  });

  it("narrow separated CIs detect significance", () => {
    expect(
      classifySeverity(45, 55, { lower: 43, upper: 47 }, { lower: 53, upper: 57 }),
    ).toBe("significant_drop");
  });

  it("real-world scenario: small drop within noise", () => {
    expect(
      classifySeverity(62, 65, { lower: 55, upper: 69 }, { lower: 58, upper: 72 }),
    ).toBe("within_noise");
  });

  it("real-world scenario: large drop outside noise", () => {
    expect(
      classifySeverity(30, 70, { lower: 25, upper: 35 }, { lower: 65, upper: 75 }),
    ).toBe("significant_drop");
  });
});
