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

  it("confidence just under the 0.7 threshold needs confirmation when a confirmed date is set but categories/audience are not (a partial, not-fully-confirmed state)", () => {
    expect(
      brandNeedsClassificationConfirmation({
        classificationStatus: "complete",
        classification: { ...REAL_CLASSIFICATION, confidence: 0.69 },
        categoryConfirmedAt: new Date(),
      }),
    ).toBe(true);
  });

  // Vunnara hotfix (18 Oct, post-df27ef8): the live bug -- Omega
  // Services confirmed categories (Plumbing + Electrical + General),
  // audience (households) and location through the UI on prod, and
  // BOTH saves succeeded, but the brand page kept showing the confirm
  // card forever because this function re-evaluated
  // classification.category/confidence ("trades_general_services",
  // 0.62 -- the OLD classifier's un-confirmable guess) on every read,
  // even though the owner had already confirmed. Once confirmed by the
  // rule above (category_confirmed_at set, categories non-empty and
  // all real CATEGORY_KEYS entries, audience set), the classifier's
  // own category/confidence must never matter again.
  it("the Omega-shaped row, once actually confirmed (categories + audience set), no longer needs confirmation -- the classifier's stale category/confidence don't matter anymore", () => {
    expect(
      brandNeedsClassificationConfirmation({
        classificationStatus: "complete",
        classification: OMEGA_SHAPED_CLASSIFICATION,
        categoryConfirmedAt: new Date(),
        categories: ["trades_plumbing", "trades_electrical", "trades_general"],
        audience: "households",
      }),
    ).toBe(false);
  });

  it("the Omega-shaped row still needs confirmation if it merely LOOKS confirmed (a confirmed date but no categories/audience set)", () => {
    expect(
      brandNeedsClassificationConfirmation({
        classificationStatus: "complete",
        classification: OMEGA_SHAPED_CLASSIFICATION,
        categoryConfirmedAt: new Date(),
        categories: [],
        audience: null,
      }),
    ).toBe(true);
  });

  it("the Omega-shaped row still needs confirmation before the owner has confirmed anything at all", () => {
    expect(
      brandNeedsClassificationConfirmation({
        classificationStatus: "complete",
        classification: OMEGA_SHAPED_CLASSIFICATION,
        categoryConfirmedAt: null,
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

  it("the Omega-shaped row is blocked with a confirmed location but no classification confirmation", () => {
    expect(
      brandReadyForAudit({
        classificationStatus: "complete",
        classification: OMEGA_SHAPED_CLASSIFICATION,
        categoryConfirmedAt: null,
        locationMode: "fixed",
      }),
    ).toBe(false);
  });

  // Vunnara hotfix (18 Oct, post-df27ef8): this is the exact live state
  // of Omega Services on prod after both confirmations succeeded
  // (category_confirmed_at and location_confirmed_at both set,
  // location_mode "fixed") -- must read ready, not blocked.
  it("the Omega-shaped row IS ready once both classification (categories+audience) and location are actually confirmed", () => {
    expect(
      brandReadyForAudit({
        classificationStatus: "complete",
        classification: OMEGA_SHAPED_CLASSIFICATION,
        categoryConfirmedAt: new Date(),
        categories: ["trades_plumbing", "trades_electrical", "trades_general"],
        audience: "households",
        locationMode: "fixed",
      }),
    ).toBe(true);
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
