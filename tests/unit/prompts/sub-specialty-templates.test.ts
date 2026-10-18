import { describe, expect, it } from "vitest";
import { CATEGORY_TEMPLATES, getTemplatesForCategory } from "@/lib/prompts/templates";

/**
 * Vunnara Build 1 addendum, item 11: some Part E templates named a
 * sub-specialty not every brand in that broad category actually
 * offers -- a Thai restaurant doesn't serve Italian food, a family-law
 * firm doesn't do criminal defence, a plumber doesn't necessarily
 * install gas hot water systems. That's the same failure as asking a
 * plumber about painters. Given the scope of building confirmed-sub-
 * service selection (a new confirm-card field, classifier changes,
 * template-selection logic) was too large for this addendum, the
 * sub-specialty templates were removed from the organic budget and
 * replaced with generic customer-intent phrasing that any brand in
 * the category can honestly answer -- kept for a future build.
 */
function allTemplates(category: string): string[] {
  return Object.values(CATEGORY_TEMPLATES[category] ?? {}).flat();
}

describe("hospitality_restaurant -- a Thai restaurant is never asked about Italian food or coffee specifically", () => {
  const templates = allTemplates("hospitality_restaurant");

  it("has no cuisine-specific question", () => {
    expect(templates.some((t) => /italian/i.test(t))).toBe(false);
  });

  it("has no coffee/cafe-specific question", () => {
    expect(templates.some((t) => /\bcoffee\b/i.test(t))).toBe(false);
  });

  it("getTemplatesForCategory for this category never returns a sub-specialty question", () => {
    const resolved = getTemplatesForCategory("hospitality_restaurant", "consumer");
    expect(resolved.some((t) => /italian|\bcoffee\b/i.test(t))).toBe(false);
    expect(resolved.length).toBeGreaterThan(0);
  });
});

describe("legal_services -- a family-law firm is never asked about criminal or traffic law", () => {
  const templates = allTemplates("legal_services");

  it("has no traffic-or-criminal-lawyer question", () => {
    expect(templates.some((t) => /traffic or criminal/i.test(t))).toBe(false);
  });

  it("has no wills-and-estates-specific question", () => {
    expect(templates.some((t) => /wills and estates/i.test(t))).toBe(false);
  });

  it("has no family-lawyer-specific question", () => {
    expect(templates.some((t) => /family lawyer/i.test(t))).toBe(false);
  });

  it("getTemplatesForCategory for this category never returns a sub-specialty question", () => {
    const resolved = getTemplatesForCategory("legal_services", "smb");
    expect(resolved.some((t) => /traffic or criminal|wills and estates|family lawyer/i.test(t))).toBe(
      false,
    );
    expect(resolved.length).toBeGreaterThan(0);
  });
});

describe("allied_health_general -- a physio-only clinic is never asked about dietitians, podiatrists, OT or speech pathology", () => {
  const templates = allTemplates("allied_health_general");

  it("names no specific allied-health discipline", () => {
    for (const word of ["dietitian", "podiatrist", "occupational therapist", "speech pathologist", "exercise physiologist"]) {
      expect(templates.some((t) => t.toLowerCase().includes(word))).toBe(false);
    }
  });
});

describe("trades_plumbing -- a plumber who doesn't do gas work is never asked about gas hot water systems", () => {
  const templates = allTemplates("trades_plumbing");

  it("has no gas-specific question", () => {
    expect(templates.some((t) => /\bgas\b/i.test(t))).toBe(false);
  });
});
