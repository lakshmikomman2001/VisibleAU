import { describe, it, expect } from "vitest";
import {
  ExplainabilityService,
  type ExplainabilityAnnotation,
} from "@/lib/platform/explainability";

describe("ExplainabilityService.annotate() — G3-01 platform contract", () => {
  it("produces rationale > 30 chars", () => {
    const result = ExplainabilityService.annotate({
      score: 75,
      scoreLabel: "Trust Score",
      maxScore: 100,
      context: { brandName: "TestBrand", dimension: "trust" },
    });
    expect(result.rationale.length).toBeGreaterThan(30);
  });

  it("includes confidence_label (High/Medium/Low/null)", () => {
    const result = ExplainabilityService.annotate({
      score: 50,
      scoreLabel: "Entity",
      maxScore: 100,
      context: { brandName: "TestBrand" },
    });
    expect(["High", "Medium", "Low", null]).toContain(result.confidence_label);
  });

  it("low sampleSize → Low confidence", () => {
    const result = ExplainabilityService.annotate({
      score: 50,
      scoreLabel: "Entity",
      maxScore: 100,
      context: { sampleSize: 1 },
    });
    expect(result.confidence_label).toBe("Low");
    expect(result.confidence_note).toBeTruthy();
  });

  it("medium sampleSize → Medium confidence", () => {
    const result = ExplainabilityService.annotate({
      score: 50,
      scoreLabel: "Entity",
      maxScore: 100,
      context: { sampleSize: 5 },
    });
    expect(result.confidence_label).toBe("Medium");
  });

  it("stale data downgrades confidence", () => {
    const result = ExplainabilityService.annotate({
      score: 50,
      scoreLabel: "Entity",
      maxScore: 100,
      context: { dataAge: "stale" },
    });
    expect(result.confidence_label).toBe("Medium");
    expect(result.confidence_note).toContain("30 days");
  });

  it("passes through topAction", () => {
    const result = ExplainabilityService.annotate({
      score: 50,
      scoreLabel: "Entity",
      maxScore: 100,
      context: {},
      topAction: "Fix your schema markup.",
    });
    expect(result.top_action).toBe("Fix your schema markup.");
  });

  it("topAction defaults to null when not provided", () => {
    const result = ExplainabilityService.annotate({
      score: 50,
      scoreLabel: "Entity",
      maxScore: 100,
      context: {},
    });
    expect(result.top_action).toBeNull();
  });

  it("high score → strong performance rationale", () => {
    const result = ExplainabilityService.annotate({
      score: 85,
      scoreLabel: "Trust",
      maxScore: 100,
      context: { brandName: "AcmeCo", dimension: "trust" },
    });
    expect(result.rationale).toContain("strong");
  });

  it("low score → gaps rationale", () => {
    const result = ExplainabilityService.annotate({
      score: 20,
      scoreLabel: "Trust",
      maxScore: 100,
      context: { brandName: "AcmeCo", dimension: "trust" },
    });
    expect(result.rationale).toContain("gaps");
  });

  it("zero score → no data rationale", () => {
    const result = ExplainabilityService.annotate({
      score: 0,
      scoreLabel: "Trust",
      maxScore: 100,
      context: { brandName: "AcmeCo", dimension: "trust" },
    });
    expect(result.rationale).toContain("No");
  });

  it("service is imported from lib/platform/explainability, not redefined", () => {
    expect(typeof ExplainabilityService.annotate).toBe("function");
  });
});
