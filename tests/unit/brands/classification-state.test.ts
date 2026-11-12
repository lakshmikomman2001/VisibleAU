/**
 * 13 Nov (Sri's walk-through, part 1): the brand page's classification state is true to what happens --
 * "running" only while the classifier is working and within CLASSIFICATION_TIMEOUT_MS (3 minutes) of when
 * the run started; then, or on a failure, "could_not_classify" (the owner chooses); "needs_confirmation"
 * when it finished unsure. And the panel's business types, vertical first.
 */
import { describe, expect, it } from "vitest";
import { categoryChoices } from "@/lib/brands/category-choices";
import { CLASSIFICATION_TIMEOUT_MS } from "@/lib/brands/classification-state";
import { classificationState } from "@/lib/brands/needs-confirmation";
import { brandLocationLabel } from "@/lib/brands/region-label";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";

const NOW = new Date("2026-11-13T00:10:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const brand = (status: string | null, startedAt: Date | null, extra: object = {}) => ({
  classificationStatus: status,
  classification: null,
  categoryConfirmedAt: null,
  startedAt,
  ...extra,
});

describe("classificationState", () => {
  it("the timeout is 3 minutes", () => {
    expect(CLASSIFICATION_TIMEOUT_MS).toBe(180_000);
  });

  it.each(["pending", "processing"])("%s within the timeout is running", (status) => {
    expect(classificationState(brand(status, ago(10_000)), NOW)).toBe("running");
    expect(classificationState(brand(status, ago(CLASSIFICATION_TIMEOUT_MS)), NOW)).toBe("running");
  });

  it.each([
    "pending",
    "processing",
  ])("%s past the timeout (no result written) is could_not_classify", (status) => {
    expect(classificationState(brand(status, ago(CLASSIFICATION_TIMEOUT_MS + 1)), NOW)).toBe(
      "could_not_classify",
    );
    expect(classificationState(brand(status, null), NOW)).toBe("could_not_classify");
  });

  it("a failed run is could_not_classify at once", () => {
    expect(classificationState(brand("failed", ago(1_000)), NOW)).toBe("could_not_classify");
  });

  it("an unsure result needs confirmation; a confident or confirmed one is complete", () => {
    expect(classificationState(brand("needs_confirmation", ago(1_000)), NOW)).toBe(
      "needs_confirmation",
    );
    const confident = {
      classification: {
        category: "trades_plumbing",
        buyerType: "smb",
        competitors: [],
        confidence: 0.9,
        intentSignals: [],
        auRelevance: "au_present",
      },
      categoryConfirmedAt: ago(1_000),
    };
    expect(classificationState(brand("complete", ago(1_000), confident), NOW)).toBe("complete");
    // The old classifier's unconfirmed guess (item 10) still needs confirming.
    const oldGuess = {
      classification: { ...confident.classification, confidence: 0.6 },
      categoryConfirmedAt: null,
    };
    expect(classificationState(brand("complete", ago(1_000), oldGuess), NOW)).toBe(
      "needs_confirmation",
    );
  });
});

describe("categoryChoices: the vertical's types first, the rest behind Other types", () => {
  it("Tradies: the four trades first, everything else after", () => {
    const { first, others } = categoryChoices("tradies", ["trades_general"]);
    expect(first).toEqual([
      "trades_plumbing",
      "trades_electrical",
      "trades_building",
      "trades_general",
    ]);
    expect(others).toContain("saas_design_tools");
    expect(others).not.toContain("trades_plumbing");
    expect([...first, ...others].sort()).toEqual([...CATEGORY_KEYS].sort());
  });

  it("a suggestion outside the vertical is shown first, never hidden", () => {
    expect(categoryChoices("tradies", ["hospitality_restaurant"]).first[0]).toBe(
      "hospitality_restaurant",
    );
  });

  it("no vertical (or an unknown one): all of them, nothing hidden", () => {
    expect(categoryChoices(null, []).others).toEqual([]);
    expect(categoryChoices("other", []).first).toHaveLength(CATEGORY_KEYS.length);
  });
});

describe("brandLocationLabel", () => {
  it.each([
    [{ suburb: "Yennora", state: "NSW" }, "Yennora, NSW"],
    [{ suburb: null, city: "Sydney", state: "NSW" }, "Sydney, NSW"],
    [{ primaryRegions: ["NSW:Yennora"] }, "Yennora, NSW"],
    [{ primaryRegions: [] }, null],
  ])("%j -> %s", (input, label) => {
    expect(brandLocationLabel(input)).toBe(label);
  });
});
