import { describe, expect, it } from "vitest";
import { detectRegion } from "@/lib/region/detect";

describe("middleware region detection integration", () => {
  it("detects au from pathname /au/dashboard", () => {
    expect(detectRegion({ pathname: "/au/dashboard" })).toBe("au");
  });

  it("detects uk from pathname /uk/pricing", () => {
    expect(detectRegion({ pathname: "/uk/pricing" })).toBe("uk");
  });

  it("URL prefix takes priority over geo for middleware use", () => {
    expect(detectRegion({ pathname: "/nz/brands", geoCountry: "AU" })).toBe("nz");
  });

  it("falls back to geo country when no URL prefix", () => {
    expect(detectRegion({ pathname: "/dashboard", geoCountry: "GB" })).toBe("uk");
  });

  it("defaults to au for protected routes without region prefix", () => {
    expect(detectRegion({ pathname: "/dashboard" })).toBe("au");
  });

  it("defaults to au for API routes without region prefix", () => {
    expect(detectRegion({ pathname: "/api/brands" })).toBe("au");
  });
});
