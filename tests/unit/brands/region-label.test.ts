import { describe, expect, it } from "vitest";
import { buildEngineLocation, resolveRegionLabel } from "@/lib/brands/region-label";

// Vunnara Build 1, Part D.5: one fallback chain, used by both audit
// runners and classify-and-store -- confirmed suburb wins, then
// confirmed city, then the legacy primaryRegions[0] string (brands
// that predate Part D), then a plain region name.
describe("resolveRegionLabel", () => {
  it("prefers the confirmed suburb over everything else, with no state suffix when a real city is already known", () => {
    const label = resolveRegionLabel({
      suburb: "Bondi",
      city: "Sydney",
      state: "NSW",
      primaryRegions: ["VIC:Fitzroy"],
      region: "au",
    });
    expect(label).toBe("Bondi");
  });

  it("falls back to the confirmed city when there's no suburb", () => {
    const label = resolveRegionLabel({
      suburb: null,
      city: "Melbourne",
      state: "VIC",
      primaryRegions: ["NSW:Bondi"],
      region: "au",
    });
    expect(label).toBe("Melbourne");
  });

  it("falls back to the legacy primaryRegions[0] (STATE:Suburb) when neither is confirmed", () => {
    const label = resolveRegionLabel({
      suburb: null,
      city: null,
      state: null,
      primaryRegions: ["NSW:Parramatta"],
      region: "au",
    });
    expect(label).toBe("Parramatta");
  });

  it("falls back to the region display name when nothing is set", () => {
    const label = resolveRegionLabel({
      suburb: null,
      city: null,
      state: null,
      primaryRegions: [],
      region: "nz",
    });
    expect(label).toBe("New Zealand");
  });

  // Vunnara hotfix (18 Oct, post-df27ef8): the live Omega Services case
  // -- "Norwest" isn't in the curated lib/locations list, so city is
  // correctly NULL (never a guessed city). Appending the state keeps
  // the label a real, disambiguated place rather than a bare suburb
  // name that could exist in more than one state.
  it("appends the state when the suburb is confirmed but there's no curated city (Omega Services' real case)", () => {
    const label = resolveRegionLabel({
      suburb: "Norwest",
      city: null,
      state: "NSW",
      primaryRegions: ["NSW:Norwest"],
      region: "au",
    });
    expect(label).toBe("Norwest, NSW");
  });

  it("uses the bare suburb (no dangling comma) when city AND state are both unknown", () => {
    const label = resolveRegionLabel({
      suburb: "Norwest",
      city: null,
      state: null,
      primaryRegions: ["NSW:Norwest"],
      region: "au",
    });
    expect(label).toBe("Norwest");
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
