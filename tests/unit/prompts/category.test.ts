import { describe, expect, it } from "vitest";
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CATEGORY_TEMPLATES,
  categoryLabel,
  getTemplatesForCategory,
  resolveCategory,
} from "@/lib/prompts/templates";

describe("CATEGORY_KEYS stays in sync with CATEGORY_TEMPLATES", () => {
  it("exactly matches Object.keys(CATEGORY_TEMPLATES), order-independent", () => {
    expect([...CATEGORY_KEYS].sort()).toEqual(Object.keys(CATEGORY_TEMPLATES).sort());
  });

  it("every CATEGORY_KEYS entry has a human label", () => {
    for (const key of CATEGORY_KEYS) {
      expect(CATEGORY_LABELS[key]).toBeTruthy();
      expect(CATEGORY_LABELS[key]).not.toContain("_");
    }
  });
});

describe("resolveCategory (Vunnara Build 1, Part C: closed category enum)", () => {
  it("Omega Services' real bad classifier output maps to trades_general, not general", () => {
    expect(resolveCategory("trades_general_services")).toBe("trades_general");
  });

  it("an exact CATEGORY_KEYS value passes through unchanged", () => {
    expect(resolveCategory("trades_plumbing")).toBe("trades_plumbing");
  });

  it("is case/whitespace/hyphen tolerant", () => {
    expect(resolveCategory("Trades-Plumbing")).toBe("trades_plumbing");
    expect(resolveCategory("  trades plumbing  ")).toBe("trades_plumbing");
  });

  it("maps common near-miss aliases", () => {
    expect(resolveCategory("home_services")).toBe("trades_general");
    expect(resolveCategory("plumber")).toBe("trades_plumbing");
    expect(resolveCategory("dentist")).toBe("allied_health_dental");
    expect(resolveCategory("law_firm")).toBe("legal_services");
    expect(resolveCategory("real_estate")).toBe("real_estate_agency");
    expect(resolveCategory("ecommerce")).toBe("ecommerce_platform");
  });

  it("falls back to the {parent}_general pattern for an unknown child slug", () => {
    expect(resolveCategory("trades_roofing")).toBe("trades_general");
  });

  it("falls back to 'general' for a completely unrecognised category", () => {
    expect(resolveCategory("intergalactic_widget_sales")).toBe("general");
  });
});

describe("categoryLabel", () => {
  it("returns a human label, never the raw slug", () => {
    expect(categoryLabel("trades_plumbing")).toBe("Plumbing");
    expect(categoryLabel("trades_general_services")).toBe("General trades");
  });

  it("falls back to the general label for unrecognised input", () => {
    expect(categoryLabel("nonsense_category")).toBe("General business");
  });
});

describe("getTemplatesForCategory resolves through the closed enum", () => {
  it("Omega's bad category still gets trades_general templates, not the generic business-tool fallback", () => {
    const resolved = getTemplatesForCategory("trades_general_services", "smb");
    const generic = getTemplatesForCategory("general", "smb");
    expect(resolved).not.toEqual(generic);
    expect(resolved.length).toBeGreaterThan(0);
  });
});
