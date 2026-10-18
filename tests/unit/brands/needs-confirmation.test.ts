import { describe, expect, it } from "vitest";
import {
  brandNeedsClassificationConfirmation,
  brandReadyForAudit,
} from "@/lib/brands/needs-confirmation";

// Build 1 addendum, item 10: the Omega bug -- buyerType "smb", confidence
// 0.62, category "trades_general_services" (not a real CATEGORY_KEYS
// entry) -- got classification_status = 'complete' under the pre-Part-C
// classifier and would never be asked to confirm.
const OMEGA_SHAPED_CLASSIFICATION = {
  category: "trades_general_services",
  buyerType: "smb" as const,
  confidence: 0.62,
  intentSignals: [],
  competitors: [],
  auRelevance: "au_present" as const,
};

const REAL_CLASSIFICATION = {
  category: "trades_plumbing",
  buyerType: "smb" as const,
  confidence: 0.95,
  intentSignals: [],
  competitors: [],
  auRelevance: "au_present" as const,
};

describe("brandNeedsClassificationConfirmation (Build 1 addendum, item 10)", () => {
  it("explicit needs_confirmation is always true, regardless of classification shape", () => {
    expect(
      brandNeedsClassificationConfirmation({
        classificationStatus: "needs_confirmation",
        classification: REAL_CLASSIFICATION,
        categoryConfirmedAt: new Date(),
      }),
    ).toBe(true);
  });

  it("pending/processing/failed are not a confirmation question -- their own existing states handle them", () => {
    for (const status of ["pending", "processing", "failed", null]) {
      expect(
        brandNeedsClassificationConfirmation({
          classificationStatus: status,
          classification: null,
          categoryConfirmedAt: null,
        }),
      ).toBe(false);
    }
  });

  it("the Omega-shaped row (complete, category not a real enum key, confidence < 0.7, never confirmed) needs confirmation", () => {
    expect(
      brandNeedsClassificationConfirmation({
        classificationStatus: "complete",
        classification: OMEGA_SHAPED_CLASSIFICATION,
        categoryConfirmedAt: null,
      }),
    ).toBe(true);
  });

  it("a complete row with a real category key, high confidence, but never explicitly confirmed still needs confirmation", () => {
    expect(
      brandNeedsClassificationConfirmation({
        classificationStatus: "complete",
        classification: REAL_CLASSIFICATION,
        categoryConfirmedAt: null,
      }),
    ).toBe(true);
  });

  it("a complete, confirmed, real-category, high-confidence row does not need confirmation", () => {
    expect(
      brandNeedsClassificationConfirmation({
        classificationStatus: "complete",
        classification: REAL_CLASSIFICATION,
        categoryConfirmedAt: new Date(),
      }),
    ).toBe(false);
  });

  it("confidence just under the 0.7 threshold needs confirmation even with a real category and a confirmed date", () => {
    expect(
      brandNeedsClassificationConfirmation({
        classificationStatus: "complete",
        classification: { ...REAL_CLASSIFICATION, confidence: 0.69 },
        categoryConfirmedAt: new Date(),
      }),
    ).toBe(true);
  });
});

describe("brandReadyForAudit (Build 1 addendum, item 9)", () => {
  it("a confirmed classification with a confirmed location is ready", () => {
    expect(
      brandReadyForAudit({
        classificationStatus: "complete",
        classification: REAL_CLASSIFICATION,
        categoryConfirmedAt: new Date(),
        locationMode: "fixed",
      }),
    ).toBe(true);
  });

  it("'online_only' location mode counts as confirmed", () => {
    expect(
      brandReadyForAudit({
        classificationStatus: "complete",
        classification: REAL_CLASSIFICATION,
        categoryConfirmedAt: new Date(),
        locationMode: "online_only",
      }),
    ).toBe(true);
  });

  it("no location confirmed at all blocks readiness, even with a fully confirmed classification", () => {
    expect(
      brandReadyForAudit({
        classificationStatus: "complete",
        classification: REAL_CLASSIFICATION,
        categoryConfirmedAt: new Date(),
        locationMode: null,
      }),
    ).toBe(false);
  });

  it("the Omega-shaped row is blocked even with a confirmed location", () => {
    expect(
      brandReadyForAudit({
        classificationStatus: "complete",
        classification: OMEGA_SHAPED_CLASSIFICATION,
        categoryConfirmedAt: null,
        locationMode: "fixed",
      }),
    ).toBe(false);
  });

  it("a brand still pending classification is never ready, even if location happens to be set", () => {
    expect(
      brandReadyForAudit({
        classificationStatus: "pending",
        classification: null,
        categoryConfirmedAt: null,
        locationMode: "fixed",
      }),
    ).toBe(false);
  });

  it("every existing brand post-push (complete status from the old classifier, never confirmed, no location) is blocked", () => {
    expect(
      brandReadyForAudit({
        classificationStatus: "complete",
        classification: REAL_CLASSIFICATION,
        categoryConfirmedAt: null,
        locationMode: null,
      }),
    ).toBe(false);
  });
});
