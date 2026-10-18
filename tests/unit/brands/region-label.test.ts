import { describe, expect, it } from "vitest";
import { resolveRegionLabel } from "@/lib/brands/region-label";

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
