import { describe, expect, it } from "vitest";
import { detectRegion } from "@/lib/region/detect";

describe("detectRegion", () => {
  it("returns au for /au/ prefix", () => {
    expect(detectRegion({ pathname: "/au/dashboard" })).toBe("au");
  });

  it("returns nz for /nz/ prefix", () => {
    expect(detectRegion({ pathname: "/nz/pricing" })).toBe("nz");
  });

  it("returns uk for /uk/ prefix", () => {
    expect(detectRegion({ pathname: "/uk/sign-up" })).toBe("uk");
  });

  it("returns us for /us/ prefix", () => {
    expect(detectRegion({ pathname: "/us/" })).toBe("us");
  });

  it("returns ca for /ca/ prefix", () => {
    expect(detectRegion({ pathname: "/ca/dashboard" })).toBe("ca");
  });

  it("returns eu for /eu/ prefix", () => {
    expect(detectRegion({ pathname: "/eu/pricing" })).toBe("eu");
  });

  it("URL prefix wins over geo country", () => {
    expect(detectRegion({ pathname: "/uk/dashboard", geoCountry: "AU" })).toBe("uk");
  });

  it("falls back to geo country when no URL prefix", () => {
    expect(detectRegion({ pathname: "/dashboard", geoCountry: "AU" })).toBe("au");
  });

  it("maps GB geo to uk region", () => {
    expect(detectRegion({ pathname: "/dashboard", geoCountry: "GB" })).toBe("uk");
  });

  it("maps NZ geo to nz region", () => {
    expect(detectRegion({ pathname: "/pricing", geoCountry: "NZ" })).toBe("nz");
  });

  it("maps US geo to us region", () => {
    expect(detectRegion({ pathname: "/", geoCountry: "US" })).toBe("us");
  });

  it("maps CA geo to ca region", () => {
    expect(detectRegion({ pathname: "/", geoCountry: "CA" })).toBe("ca");
  });

  it("maps DE (Germany) to eu region", () => {
    expect(detectRegion({ pathname: "/dashboard", geoCountry: "DE" })).toBe("eu");
  });

  it("maps FR (France) to eu region", () => {
    expect(detectRegion({ pathname: "/", geoCountry: "FR" })).toBe("eu");
  });

  it("maps IE (Ireland) to eu region", () => {
    expect(detectRegion({ pathname: "/", geoCountry: "IE" })).toBe("eu");
  });

  it("defaults to au when no prefix and no geo", () => {
    expect(detectRegion({ pathname: "/dashboard" })).toBe("au");
  });

  it("defaults to au for unknown geo country", () => {
    expect(detectRegion({ pathname: "/", geoCountry: "JP" })).toBe("au");
  });

  it("handles bare region path without trailing slash", () => {
    expect(detectRegion({ pathname: "/nz" })).toBe("nz");
  });
});
