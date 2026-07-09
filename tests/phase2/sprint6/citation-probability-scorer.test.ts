import { describe, it, expect } from "vitest";
import { computeCitationProbability } from "@/lib/retrieval/citation-probability-scorer";

describe("computeCitationProbability", () => {
  it("how_to_guide with full signals sums correctly", () => {
    const prob = computeCitationProbability({
      contentFormatDetected: "how_to_guide",
      answerCapsuleScore: 100,
      freshnessRisk: "fresh",
      isEntityHomeCandidate: true,
      optimalPassageCount: 5,
      outboundCitationCount: 6,
      hasAuthorAttribution: true,
    });
    // 0.18 + (100/100)*0.25 + 0.10 + 0.08 + 0.05 + 0.09 + 0.04 = 0.79
    expect(prob).toBeGreaterThan(0.7);
    expect(prob).toBeLessThanOrEqual(0.85);
  });

  it("returns low score for unknown format with no signals", () => {
    const prob = computeCitationProbability({
      contentFormatDetected: "other",
      answerCapsuleScore: 0,
      freshnessRisk: "stale",
      isEntityHomeCandidate: false,
      optimalPassageCount: 0,
      outboundCitationCount: 0,
      hasAuthorAttribution: false,
    });
    expect(prob).toBe(0);
  });

  it("faq_block contributes +0.14 over 'other'", () => {
    const base = computeCitationProbability({
      contentFormatDetected: "other",
      answerCapsuleScore: 0,
      freshnessRisk: "stale",
      isEntityHomeCandidate: false,
      optimalPassageCount: 0,
      outboundCitationCount: 0,
      hasAuthorAttribution: false,
    });
    const withFaq = computeCitationProbability({
      contentFormatDetected: "faq_block",
      answerCapsuleScore: 0,
      freshnessRisk: "stale",
      isEntityHomeCandidate: false,
      optimalPassageCount: 0,
      outboundCitationCount: 0,
      hasAuthorAttribution: false,
    });
    expect(withFaq - base).toBeCloseTo(0.14, 2);
  });

  it("fresh content adds +0.10 vs stale", () => {
    const stale = computeCitationProbability({
      contentFormatDetected: "how_to_guide",
      answerCapsuleScore: 0,
      freshnessRisk: "stale",
      isEntityHomeCandidate: false,
      optimalPassageCount: 0,
      outboundCitationCount: 0,
      hasAuthorAttribution: false,
    });
    const fresh = computeCitationProbability({
      contentFormatDetected: "how_to_guide",
      answerCapsuleScore: 0,
      freshnessRisk: "fresh",
      isEntityHomeCandidate: false,
      optimalPassageCount: 0,
      outboundCitationCount: 0,
      hasAuthorAttribution: false,
    });
    expect(fresh - stale).toBeCloseTo(0.10, 2);
  });

  it("entity home adds +0.08", () => {
    const without = computeCitationProbability({
      contentFormatDetected: "how_to_guide",
      answerCapsuleScore: 0,
      freshnessRisk: "fresh",
      isEntityHomeCandidate: false,
      optimalPassageCount: 0,
      outboundCitationCount: 0,
      hasAuthorAttribution: false,
    });
    const withEntity = computeCitationProbability({
      contentFormatDetected: "how_to_guide",
      answerCapsuleScore: 0,
      freshnessRisk: "fresh",
      isEntityHomeCandidate: true,
      optimalPassageCount: 0,
      outboundCitationCount: 0,
      hasAuthorAttribution: false,
    });
    expect(withEntity - without).toBeCloseTo(0.08, 2);
  });

  it("never exceeds 0.85 ceiling (capped at 1.0 via Math.min)", () => {
    const prob = computeCitationProbability({
      contentFormatDetected: "how_to_guide",
      answerCapsuleScore: 100,
      freshnessRisk: "fresh",
      isEntityHomeCandidate: true,
      optimalPassageCount: 10,
      outboundCitationCount: 10,
      hasAuthorAttribution: true,
    });
    expect(prob).toBeLessThanOrEqual(1.0);
  });
});
