import { describe, expect, it } from "vitest";
import {
  classifyConfidence,
  displayConfidenceLabel,
  displayPriorityLabel,
  displayRecommendationTitle,
  isLegacyConfidence,
  LEGACY_CONFIDENCE_LABEL,
  LEGACY_CONFIDENCE_SHORT_TEXT,
  LEGACY_TITLE_PREFIX,
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
  it("directory-visibility → confirmed", () =>
    expect(classifyConfidence("directory-visibility")).toBe("confirmed"));
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

// Task #46 (fix: stored value contradicting its own CI), Part C +
// follow-up #1: an action_items row's stored confidence_label was a
// static table lookup before commit 5fe41c0 -- "confirmed" with nothing
// checked for the brand. Legacy is marked by DATA (action_items.
// confidence_basis, migration 0046 -- null means the row predates that
// column, whatever its created_at), never by a commit timestamp: code
// reaches prod on deploy, not on commit, so a row created after
// 5fe41c0's commit time but before its actual prod deploy is still
// legacy, and the old timestamp-only cutoff would have wrongly trusted
// it.
describe("isLegacyConfidence / displayConfidenceLabel (legacy rows never show a stale 'confirmed')", () => {
  it("a row with no confidence_basis marker is legacy, regardless of how recent", () => {
    expect(isLegacyConfidence(null)).toBe(true);
    expect(isLegacyConfidence(undefined)).toBe(true);
  });

  it("a row carrying a real confidence_basis marker is not legacy", () => {
    expect(isLegacyConfidence("verified")).toBe(false);
    expect(isLegacyConfidence("inferred")).toBe(false);
    expect(isLegacyConfidence("speculative")).toBe(false);
  });

  // The exact bug this follow-up fixes: a row created AFTER 5fe41c0's
  // commit time (so the old createdAt-cutoff would have called it
  // non-legacy) but with no confidence_basis marker at all -- it still
  // came from the old static table, because the evidence-driven CODE
  // hadn't actually reached prod yet (deploy lags commit). Bondi #19 /
  // Get Plumbing #22-23 / Plumber To The Rescue #25 are this shape.
  it("a row created after the old commit-time cutoff, but with no marker, is still legacy", () => {
    expect(isLegacyConfidence(null)).toBe(true);
  });

  it("a legacy row's stored 'confirmed' displays as the legacy sentinel, never 'confirmed'", () => {
    const displayed = displayConfidenceLabel("confirmed", null);
    expect(displayed).toBe(LEGACY_CONFIDENCE_LABEL);
    expect(displayed).not.toBe("confirmed");
  });

  it("a new, evidence-backed row's stored 'confirmed' still displays as 'confirmed'", () => {
    expect(displayConfidenceLabel("confirmed", "verified")).toBe("confirmed");
  });

  it("a new row's stored 'likely'/'hypothesis' pass through unchanged", () => {
    expect(displayConfidenceLabel("likely", "inferred")).toBe("likely");
    expect(displayConfidenceLabel("hypothesis", "speculative")).toBe("hypothesis");
  });

  // Audit #8's exact shape: dimension "accuracy", confidence "confirmed",
  // no confidence_basis marker (generated before the column existed).
  it("Audit #8-shaped legacy row renders 'Source citation' + 'Not verified', not raw 'accuracy' + 'confirmed'", () => {
    expect(dimensionLabel("accuracy")).toBe("Source citation");
    const displayed = displayConfidenceLabel("confirmed", null);
    expect(displayed).toBe(LEGACY_CONFIDENCE_LABEL);
    expect(LEGACY_CONFIDENCE_SHORT_TEXT).toBe("Not verified");
  });

  it("a new evidence-backed row with the same dimension still renders 'confirmed'", () => {
    expect(dimensionLabel("accuracy")).toBe("Source citation");
    expect(displayConfidenceLabel("confirmed", "verified")).toBe("confirmed");
  });
});

// Build 1 addendum, item 1: live on Bondi Audit #8 (18 Oct), a legacy
// row's TITLE still stated the claim as fact ("Your AU local directory
// listings are incomplete") and its priority badge stayed a plain red
// "High" -- the "not verified" text only showed up in a small secondary
// line. displayConfidenceLabel alone wasn't enough; the title and the
// priority badge need their own read-time transform.
describe("displayRecommendationTitle (legacy rows read as a check to make, not a settled claim)", () => {
  const title = (
    t: string,
    confidenceBasis: string | null | undefined,
    recommendationKey = "au-local-citations",
  ) => displayRecommendationTitle({ title: t, confidenceBasis, recommendationKey });

  it("prefixes a legacy row's title with the check prefix", () => {
    expect(title("Your AU local directory listings are incomplete", null)).toBe(
      `${LEGACY_TITLE_PREFIX}Your AU local directory listings are incomplete`,
    );
  });

  it("leaves an evidence-backed row's title unchanged", () => {
    expect(title("Your AU local directory listings are incomplete", "verified")).toBe(
      "Your AU local directory listings are incomplete",
    );
  });

  it("applies regardless of which rule produced the title -- never keyed by recommendation_key", () => {
    expect(title("Update pages that haven't changed in 90+ days", undefined, "stale-content")).toBe(
      `${LEGACY_TITLE_PREFIX}Update pages that haven't changed in 90+ days`,
    );
  });
});

describe("displayPriorityLabel (a legacy row's priority badge never looks like a confirmed urgent problem)", () => {
  it("appends 'unverified' to a legacy row's impact label", () => {
    expect(displayPriorityLabel("High", null)).toBe("High · unverified");
  });

  it("leaves an evidence-backed row's impact label unchanged", () => {
    expect(displayPriorityLabel("High", "inferred")).toBe("High");
    expect(displayPriorityLabel("High", "verified")).toBe("High");
    expect(displayPriorityLabel("High", "speculative")).toBe("High");
  });
});
