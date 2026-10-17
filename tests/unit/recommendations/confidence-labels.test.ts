import { describe, expect, it } from "vitest";
import {
  classifyConfidence,
  displayConfidenceLabel,
  EVIDENCE_DRIVEN_CONFIDENCE_CUTOFF,
  isLegacyConfidence,
  LEGACY_CONFIDENCE_LABEL,
  LEGACY_CONFIDENCE_SHORT_TEXT,
  resolveConfidence,
} from "@/lib/recommendations/confidence-labels";
import { dimensionLabel } from "@/lib/scoring/dimension-labels";

// classifyConfidence is now the static per-rule CEILING only. The label a
// recommendation ships with is resolveConfidence(key, basis) -- see
// evidence-driven-rules.test.ts for the data-driven side.
describe("classifyConfidence (ceiling)", () => {
  it("entity-profiles → confirmed ceiling", () =>
    expect(classifyConfidence("entity-profiles")).toBe("confirmed"));
  it("wikipedia-article → confirmed", () =>
    expect(classifyConfidence("wikipedia-article")).toBe("confirmed"));
  it("au-local-citations → confirmed", () =>
    expect(classifyConfidence("au-local-citations")).toBe("confirmed"));
  it("stale-content → confirmed", () =>
    expect(classifyConfidence("stale-content")).toBe("confirmed"));

  it("faq-content → likely", () => expect(classifyConfidence("faq-content")).toBe("likely"));
  it("expert-quotes → likely", () => expect(classifyConfidence("expert-quotes")).toBe("likely"));
  it("cited-statistics → likely", () =>
    expect(classifyConfidence("cited-statistics")).toBe("likely"));
  it("reddit-absence → likely", () => expect(classifyConfidence("reddit-absence")).toBe("likely"));
  it("press-mentions → likely", () => expect(classifyConfidence("press-mentions")).toBe("likely"));

  it("comparison-article → hypothesis", () =>
    expect(classifyConfidence("comparison-article")).toBe("hypothesis"));
  it("medium-presence → hypothesis", () =>
    expect(classifyConfidence("medium-presence")).toBe("hypothesis"));
  it("linkedin-presence → hypothesis", () =>
    expect(classifyConfidence("linkedin-presence")).toBe("hypothesis"));

  it("unknown key → hypothesis (conservative default)", () =>
    expect(classifyConfidence("unknown-key")).toBe("hypothesis"));
});

describe("resolveConfidence (ceiling ∧ evidence)", () => {
  it("a 'confirmed' ceiling ships 'confirmed' only when verified", () => {
    expect(resolveConfidence("wikipedia-article", "verified")).toBe("confirmed");
    expect(resolveConfidence("wikipedia-article", "inferred")).toBe("likely");
    expect(resolveConfidence("wikipedia-article", "speculative")).toBe("hypothesis");
  });
  it("unknown key stays hypothesis even when verified", () =>
    expect(resolveConfidence("unknown-key", "verified")).toBe("hypothesis"));
});

// Task #46 (fix: stored value contradicting its own CI), Part C: an
// action_items row's stored confidence_label was a static table lookup
// before commit 5fe41c0 -- "confirmed" with nothing checked for the
// brand. A legacy row must never display that stale "confirmed"; a row
// created under the evidence-driven system must still display its real
// stored label unchanged.
describe("isLegacyConfidence / displayConfidenceLabel (Part C: legacy rows never show a stale 'confirmed')", () => {
  const BEFORE_CUTOFF = new Date(EVIDENCE_DRIVEN_CONFIDENCE_CUTOFF.getTime() - 1000);
  const AFTER_CUTOFF = new Date(EVIDENCE_DRIVEN_CONFIDENCE_CUTOFF.getTime() + 1000);

  it("Audit #8-shaped legacy row (generated 3 Oct, before the cutoff) is legacy", () => {
    const generatedOct3 = new Date("2026-10-03T00:00:00+11:00");
    expect(isLegacyConfidence(generatedOct3)).toBe(true);
  });

  it("a row created right before the cutoff is legacy", () => {
    expect(isLegacyConfidence(BEFORE_CUTOFF)).toBe(true);
  });

  it("a row created right after the cutoff is not legacy", () => {
    expect(isLegacyConfidence(AFTER_CUTOFF)).toBe(false);
  });

  it("a legacy row's stored 'confirmed' displays as the legacy sentinel, never 'confirmed'", () => {
    const displayed = displayConfidenceLabel("confirmed", BEFORE_CUTOFF);
    expect(displayed).toBe(LEGACY_CONFIDENCE_LABEL);
    expect(displayed).not.toBe("confirmed");
  });

  it("a new, evidence-backed row's stored 'confirmed' still displays as 'confirmed'", () => {
    expect(displayConfidenceLabel("confirmed", AFTER_CUTOFF)).toBe("confirmed");
  });

  it("a new row's stored 'likely'/'hypothesis' pass through unchanged", () => {
    expect(displayConfidenceLabel("likely", AFTER_CUTOFF)).toBe("likely");
    expect(displayConfidenceLabel("hypothesis", AFTER_CUTOFF)).toBe("hypothesis");
  });

  // Audit #8's exact shape: dimension "accuracy", confidence "confirmed",
  // generated 3 Oct (before the cutoff).
  it("Audit #8-shaped legacy row renders 'Source citation' + 'Not verified', not raw 'accuracy' + 'confirmed'", () => {
    const generatedOct3 = new Date("2026-10-03T00:00:00+11:00");
    expect(dimensionLabel("accuracy")).toBe("Source citation");
    const displayed = displayConfidenceLabel("confirmed", generatedOct3);
    expect(displayed).toBe(LEGACY_CONFIDENCE_LABEL);
    expect(LEGACY_CONFIDENCE_SHORT_TEXT).toBe("Not verified");
  });

  it("a new evidence-backed row with the same dimension still renders 'confirmed'", () => {
    expect(dimensionLabel("accuracy")).toBe("Source citation");
    expect(displayConfidenceLabel("confirmed", AFTER_CUTOFF)).toBe("confirmed");
  });
});
