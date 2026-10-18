import { describe, expect, it } from "vitest";
import { buildEngineLocation, resolveRegionLabel } from "@/lib/brands/region-label";

// Vunnara Build 1, Part D.5: one fallback chain, used by both audit
// runners and classify-and-store -- confirmed suburb wins, then
// confirmed city, then the legacy primaryRegions[0] string (brands
// that predate Part D), then a plain region name.
describe("resolveRegionLabel", () => {
  it("prefers the confirmed suburb over everything else", () => {
    const label = resolveRegionLabel({
      suburb: "Bondi",
      city: "Sydney",
      primaryRegions: ["VIC:Fitzroy"],
      region: "au",
    });
    expect(label).toBe("Bondi");
  });

  it("falls back to the confirmed city when there's no suburb", () => {
    const label = resolveRegionLabel({
      suburb: null,
      city: "Melbourne",
      primaryRegions: ["NSW:Bondi"],
      region: "au",
    });
    expect(label).toBe("Melbourne");
  });

  it("falls back to the legacy primaryRegions[0] (STATE:Suburb) when neither is confirmed", () => {
    const label = resolveRegionLabel({
      suburb: null,
      city: null,
      primaryRegions: ["NSW:Parramatta"],
      region: "au",
    });
    expect(label).toBe("Parramatta");
  });

  it("falls back to the region display name when nothing is set", () => {
    const label = resolveRegionLabel({
      suburb: null,
      city: null,
      primaryRegions: [],
      region: "nz",
    });
    expect(label).toBe("New Zealand");
  });
});

// Vunnara Build 1, Part G.3: the approximate location passed to a web
// search tool -- only when a FIXED location is actually confirmed,
// never guessed, never for an online-only brand.
describe("buildEngineLocation", () => {
  it("returns city/region/country for a confirmed fixed location", () => {
    const location = buildEngineLocation({
      locationMode: "fixed",
      locationConfirmedAt: new Date("2026-06-01"),
      city: "Sydney",
      state: "NSW",
    });
    expect(location).toEqual({ city: "Sydney", region: "NSW", country: "AU" });
  });

  it("returns undefined for an online-only brand", () => {
    const location = buildEngineLocation({
      locationMode: "online_only",
      locationConfirmedAt: new Date("2026-06-01"),
      city: null,
      state: null,
    });
    expect(location).toBeUndefined();
  });

  it("returns undefined when location hasn't been confirmed yet", () => {
    const location = buildEngineLocation({
      locationMode: "fixed",
      locationConfirmedAt: null,
      city: "Sydney",
      state: "NSW",
    });
    expect(location).toBeUndefined();
  });

  it("returns undefined when locationMode is null (brand predates Part D)", () => {
    const location = buildEngineLocation({
      locationMode: null,
      locationConfirmedAt: null,
      city: null,
      state: null,
    });
    expect(location).toBeUndefined();
  });

  it("omits region when state isn't set", () => {
    const location = buildEngineLocation({
      locationMode: "fixed",
      locationConfirmedAt: new Date("2026-06-01"),
      city: "Sydney",
      state: null,
    });
    expect(location).toEqual({ city: "Sydney", region: undefined, country: "AU" });
  });
});
