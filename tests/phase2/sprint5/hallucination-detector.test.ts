import { describe, it, expect } from "vitest";
import {
  classifyClaimType,
  getSeverity,
} from "@/lib/trust/hallucination-detector";

describe("classifyClaimType — keyword matching from flags array", () => {
  it("maps price_mismatch → wrong_price", () => {
    expect(classifyClaimType(["price_mismatch"])).toBe("wrong_price");
  });

  it("maps location_mismatch → wrong_location", () => {
    expect(classifyClaimType(["location_mismatch"])).toBe("wrong_location");
  });

  it("maps competitor_mention → competitor_confusion", () => {
    expect(classifyClaimType(["competitor_mention"])).toBe(
      "competitor_confusion",
    );
  });

  it("maps founder_mismatch → wrong_founder", () => {
    expect(classifyClaimType(["founder_mismatch"])).toBe("wrong_founder");
  });

  it("maps product_mismatch → wrong_product", () => {
    expect(classifyClaimType(["product_mismatch"])).toBe("wrong_product");
  });

  it("returns other for unrecognized flags", () => {
    expect(classifyClaimType(["some_random_flag"])).toBe("other");
  });

  it("returns other for empty array", () => {
    expect(classifyClaimType([])).toBe("other");
  });

  it("returns other for null input", () => {
    expect(classifyClaimType(null)).toBe("other");
  });
});

describe("getSeverity — claim_type to severity mapping", () => {
  it("wrong_price → critical", () => {
    expect(getSeverity("wrong_price")).toBe("critical");
  });

  it("wrong_founder → critical", () => {
    expect(getSeverity("wrong_founder")).toBe("critical");
  });

  it("competitor_confusion → critical", () => {
    expect(getSeverity("competitor_confusion")).toBe("critical");
  });

  it("wrong_product → warning", () => {
    expect(getSeverity("wrong_product")).toBe("warning");
  });

  it("wrong_location → warning", () => {
    expect(getSeverity("wrong_location")).toBe("warning");
  });

  it("other → info", () => {
    expect(getSeverity("other")).toBe("info");
  });
});
