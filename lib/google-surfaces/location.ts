import locations from "./data/dataforseo-au-locations.json";

/**
 * Google AI surfaces, Phase 1, part 2 -- where an audit's Google results are located (Sri's decision, 8 Nov:
 * the postcode, from the brand's confirmed location; with no postcode, the nearest Google location the
 * provider supports, labelled; never silently the whole country).
 *
 * The postcode (13 Nov, part 8): the operator's on /admin/settings (brand_google_locations) as an override, else
 * the brand's own (brands.postcode, migration 0146, given by the owner with the suburb) -- googleLocationForBrand
 * below. In order:
 * 1. that postcode, if it's in the provider's list ("2161 NSW", precise);
 * 2. the confirmed suburb, if the provider has it as a place ("Castle Hill NSW", precise);
 * 3. the confirmed city ("Results for Sydney NSW, not your suburb");
 * 4. the state's capital ("Results for Sydney NSW, not your suburb").
 * An online-only brand, or one with no state, gets none: the audit skips Google and says why.
 *
 * The list is lib/google-surfaces/data/dataforseo-au-locations.json, a cached copy of DataForSEO's Google
 * locations (scripts/google-surfaces/build-dataforseo-au-locations.ts). AI Mode has no list of its own and
 * accepted the same codes on 11 Nov.
 */

export interface GoogleLocation {
  /** The provider's location_code (Google's geotarget id). */
  code: number;
  /** What the audit page prints: "2153 NSW", "Castle Hill NSW", "Sydney NSW". */
  label: string;
  kind: "postcode" | "suburb" | "city" | "state_capital";
  /** False when it isn't the brand's own suburb or postcode; `note` says so. */
  precise: boolean;
  note: string | null;
}

export type GoogleLocationResult =
  | { ok: true; location: GoogleLocation }
  | { ok: false; reason: string };

interface LocationTable {
  states: Record<string, number>;
  postcodes: Record<string, [number, string]>;
  places: Record<string, Record<string, number>>;
}

const TABLE = locations as unknown as LocationTable;

const STATE_CAPITALS: Record<string, string> = {
  ACT: "Canberra",
  NSW: "Sydney",
  NT: "Darwin",
  QLD: "Brisbane",
  SA: "Adelaide",
  TAS: "Hobart",
  VIC: "Melbourne",
  WA: "Perth",
};

/** "nsw" / "New South Wales" -> "NSW"; null when it isn't an Australian state or territory. */
function stateCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (STATE_CAPITALS[s]) return s;
  const byName: Record<string, string> = {
    "AUSTRALIAN CAPITAL TERRITORY": "ACT",
    "NEW SOUTH WALES": "NSW",
    "NORTHERN TERRITORY": "NT",
    QUEENSLAND: "QLD",
    "SOUTH AUSTRALIA": "SA",
    TASMANIA: "TAS",
    VICTORIA: "VIC",
    "WESTERN AUSTRALIA": "WA",
  };
  return byName[s] ?? null;
}

function place(state: string, name: string | null | undefined): number | null {
  if (!name) return null;
  const places = TABLE.places[state] ?? {};
  const wanted = name.trim().toLowerCase();
  for (const [placeName, code] of Object.entries(places)) {
    if (placeName.toLowerCase() === wanted) return code;
  }
  return null;
}

function titleCase(name: string): string {
  return name.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveGoogleLocation(brand: {
  postcode: string | null;
  suburb: string | null;
  city: string | null;
  state: string | null;
  locationMode: string | null;
}): GoogleLocationResult {
  if (brand.locationMode === "online_only") {
    return {
      ok: false,
      reason: "An online-only business has no suburb to locate Google results at.",
    };
  }
  const state = stateCode(brand.state);
  const postcode = brand.postcode?.trim() ?? null;
  if (postcode) {
    const row = TABLE.postcodes[postcode];
    if (row) {
      return {
        ok: true,
        location: {
          code: row[0],
          label: `${postcode} ${row[1]}`,
          kind: "postcode",
          precise: true,
          note: null,
        },
      };
    }
  }
  if (!state) {
    return {
      ok: false,
      reason:
        "The business has no state, so there's no Google location for it. Set a postcode on /admin/settings.",
    };
  }
  const suburbCode = place(state, brand.suburb);
  if (suburbCode !== null && brand.suburb) {
    return {
      ok: true,
      location: {
        code: suburbCode,
        label: `${titleCase(brand.suburb)} ${state}`,
        kind: "suburb",
        precise: true,
        note: null,
      },
    };
  }
  const nearest = (
    code: number,
    name: string,
    kind: "city" | "state_capital",
  ): GoogleLocationResult => ({
    ok: true,
    location: {
      code,
      label: `${name} ${state}`,
      kind,
      precise: false,
      note: `Results for ${name} ${state}, not your suburb`,
    },
  });
  const cityCode = place(state, brand.city);
  if (cityCode !== null && brand.city) return nearest(cityCode, titleCase(brand.city), "city");
  const capital = STATE_CAPITALS[state];
  const capitalCode = place(state, capital);
  if (capitalCode !== null) return nearest(capitalCode, capital, "state_capital");
  return { ok: false, reason: `The provider has no Google location for ${state}.` };
}

/**
 * 13 Nov (Sri's walk-through, part 8): Hero Home Services is in Yennora (2161), but with no operator postcode
 * its Google block was for "Sydney NSW, not your suburb" (Yennora isn't one of the provider's places, and the
 * app's suburb list has no postcodes). The brand's own postcode is used now; the operator's is an override.
 */
export function googleLocationForBrand(
  operatorPostcode: string | null,
  brand: {
    postcode: string | null;
    suburb: string | null;
    city: string | null;
    state: string | null;
    locationMode: string | null;
  },
): GoogleLocationResult {
  return resolveGoogleLocation({ ...brand, postcode: operatorPostcode ?? brand.postcode });
}
