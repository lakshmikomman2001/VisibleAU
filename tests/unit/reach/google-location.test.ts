/**
 * S04 part 5 (LLD 8.4.5; D-QI7): where Google AI is checked for each reach.
 * - Local: the audit's own location, unchanged;
 * - State: DataForSEO's state location (New South Wales 20035, labelled "NSW"; Tasmania by its name); a state DataForSEO
 *   doesn't list is checked from its capital, labelled "Sydney, as NSW" -> "Checked from Sydney, as NSW";
 * - Country: Australia (2036);
 * - Worldwide: not checked.
 * - None when the market can't place the reach (the US stub; a brand with no state).
 */
import { describe, expect, it } from "vitest";
import { resolveGoogleLocation } from "@/lib/google-surfaces/location";
import { AU_MARKET } from "@/lib/markets/au";
import {
  checkedFromText,
  googleLocationForReach,
  googleLocationForState,
  WORLDWIDE_GOOGLE_NOTE,
} from "@/lib/reach/google-location";

const LOCAL = { code: 9071744, label: "2153 NSW" };
const NSW_BRAND = { state: "NSW", region: "au" };

describe("Google AI location per reach", () => {
  it("Local is the audit's own location; no reach reads as Local", () => {
    expect(googleLocationForReach("local", NSW_BRAND, LOCAL)).toEqual(LOCAL);
    expect(googleLocationForReach(undefined, NSW_BRAND, LOCAL)).toEqual(LOCAL);
  });

  it("State is DataForSEO's state; Country is Australia; Worldwide isn't checked", () => {
    expect(googleLocationForReach("state", NSW_BRAND, LOCAL)).toEqual({
      code: 20035,
      label: "NSW",
    });
    expect(googleLocationForReach("state", { state: "TAS", region: "au" }, LOCAL)).toEqual({
      code: 20039,
      label: "Tasmania",
    });
    expect(googleLocationForReach("country", NSW_BRAND, LOCAL)).toEqual({
      code: 2036,
      label: "Australia",
    });
    expect(googleLocationForReach("global", NSW_BRAND, LOCAL)).toBeNull();
    expect(WORLDWIDE_GOOGLE_NOTE).toBe(
      "Worldwide questions are measured on the four AI engines only.",
    );
  });

  it("a state DataForSEO doesn't list is checked from its capital, labelled so", () => {
    const nsw = AU_MARKET.states.find((s) => s.code === "NSW");
    if (!nsw) throw new Error("no NSW");
    const sydney = resolveGoogleLocation({
      postcode: null,
      suburb: null,
      city: "Sydney",
      state: "NSW",
      locationMode: null,
    });
    if (!sydney.ok) throw new Error("no Sydney place");
    const unlisted = googleLocationForState({ ...nsw, googleLocation: null });
    expect(unlisted?.label).toBe("Sydney, as NSW");
    expect(checkedFromText(unlisted?.label ?? "")).toBe("Checked from Sydney, as NSW");
    expect(unlisted?.code).toBe(sydney.location.code);
    expect(unlisted?.code).not.toBe(20035);
  });

  it("none when the market can't place the reach", () => {
    expect(googleLocationForReach("state", { state: null, region: "au" }, LOCAL)).toBeNull();
    expect(googleLocationForReach("state", { state: "CA", region: "us" }, LOCAL)).toBeNull();
    expect(googleLocationForReach("country", { state: "CA", region: "us" }, LOCAL)).toBeNull();
  });
});
