/**
 * Google AI surfaces, Phase 1, part 2 -- where Google results are located (Sri, 8 Nov): the postcode; with
 * none, the nearest place the provider has, labelled; never the whole country. Codes are DataForSEO's own
 * (lib/google-surfaces/data/dataforseo-au-locations.json, from its public list of 2 Nov 2026).
 */
import { describe, expect, it } from "vitest";
import locations from "@/lib/google-surfaces/data/dataforseo-au-locations.json";
import { resolveGoogleLocation } from "@/lib/google-surfaces/location";

const brand = {
  postcode: null as string | null,
  suburb: null as string | null,
  city: null as string | null,
  state: "NSW" as string | null,
  locationMode: "fixed" as string | null,
};

describe("resolveGoogleLocation", () => {
  it("the cached list is the provider's Australian rows", () => {
    expect(locations.rows).toBe(5798);
    expect(locations.country).toBe(2036);
    expect(Object.keys(locations.postcodes).length).toBeGreaterThan(2500);
  });

  it("a postcode: 2153 is 9071744, '2153 NSW', precise (the 11 Nov sample's location)", () => {
    expect(resolveGoogleLocation({ ...brand, postcode: "2153", suburb: "Norwest" })).toEqual({
      ok: true,
      location: { code: 9071744, label: "2153 NSW", kind: "postcode", precise: true, note: null },
    });
  });

  it("no postcode, a suburb the provider has: that suburb, precise", () => {
    const r = resolveGoogleLocation({ ...brand, suburb: "castle hill" });
    expect(r).toEqual({
      ok: true,
      location: {
        code: 9198807,
        label: "Castle Hill NSW",
        kind: "suburb",
        precise: true,
        note: null,
      },
    });
  });

  it("a suburb it doesn't have (Norwest): the city if confirmed, else the state's capital, labelled", () => {
    expect(resolveGoogleLocation({ ...brand, suburb: "Norwest" })).toEqual({
      ok: true,
      location: {
        code: 1000286,
        label: "Sydney NSW",
        kind: "state_capital",
        precise: false,
        note: "Results for Sydney NSW, not your suburb",
      },
    });
    const withCity = resolveGoogleLocation({ ...brand, suburb: "Norwest", city: "Parramatta" });
    expect(withCity.ok && withCity.location).toMatchObject({
      kind: "city",
      label: "Parramatta NSW",
      precise: false,
      note: "Results for Parramatta NSW, not your suburb",
    });
  });

  it("a postcode the provider doesn't list falls through to the suburb and city rule", () => {
    const r = resolveGoogleLocation({ ...brand, postcode: "0000", suburb: "Castle Hill" });
    expect(r.ok && r.location.kind).toBe("suburb");
  });

  it("never the whole country: online-only and no-state brands get no location, with why", () => {
    expect(resolveGoogleLocation({ ...brand, locationMode: "online_only" })).toEqual({
      ok: false,
      reason: "An online-only business has no suburb to locate Google results at.",
    });
    const noState = resolveGoogleLocation({ ...brand, state: null, suburb: "Norwest" });
    expect(noState.ok).toBe(false);
    for (const state of ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]) {
      const r = resolveGoogleLocation({ ...brand, state });
      expect(r.ok && r.location.code, state).not.toBe(2036);
      expect(r.ok && r.location.kind, state).toBe("state_capital");
    }
  });
});
