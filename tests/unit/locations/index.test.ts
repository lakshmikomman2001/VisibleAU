import { describe, expect, it } from "vitest";
import { AU_LOCATIONS, findLocation, searchLocations } from "@/lib/locations";

describe("AU_LOCATIONS (Vunnara Build 1, Part D)", () => {
  it("every entry has a non-empty city and state", () => {
    for (const loc of AU_LOCATIONS) {
      expect(loc.city).toBeTruthy();
      expect(loc.state).toBeTruthy();
    }
  });

  it("every entry's value starts with its state", () => {
    for (const loc of AU_LOCATIONS) {
      expect(loc.value.startsWith(`${loc.state}:`)).toBe(true);
    }
  });

  it("every value is unique", () => {
    const values = AU_LOCATIONS.map((l) => l.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("searchLocations", () => {
  it("matches a suburb by partial label (case-insensitive)", () => {
    const results = searchLocations("bondi");
    expect(results.some((l) => l.value === "NSW:Bondi")).toBe(true);
  });

  it("caps results at 10", () => {
    const results = searchLocations(""); // matches everything
    expect(results.length).toBeLessThanOrEqual(10);
  });
});

describe("findLocation", () => {
  it("finds a known value and returns its city/state", () => {
    const loc = findLocation("NSW:Bondi");
    expect(loc).not.toBeNull();
    expect(loc?.city).toBe("Sydney");
    expect(loc?.state).toBe("NSW");
  });

  it("returns null for an unknown value", () => {
    expect(findLocation("XX:Nowhere")).toBeNull();
  });
});
