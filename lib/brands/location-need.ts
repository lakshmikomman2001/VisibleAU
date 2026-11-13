/**
 * 13 Nov, part 2 (Sri's live check): what the brand page asks about the business's location, as one answer.
 *
 * - "confirm": the location was never confirmed (locationConfirmedAt is null -- every brand from before Part
 *   D.4). The "Confirm your business location" card; audits wait for it.
 * - "postcode": the location is confirmed and fixed, and the only thing missing is the postcode (migration
 *   0146, part 8 of 13 Nov): existing brands like Omega and Hero. One field and one Save: "Add your postcode so
 *   Google checks from your suburb". Audits don't wait for it (Google falls back to the nearest place it lists).
 * - null: nothing to ask (online only, a postcode already given, or an old caller that passes no
 *   locationConfirmedAt at all -- treated as confirmed, as the page always has).
 */
export type LocationNeed = "confirm" | "postcode" | null;

export function locationNeed(brand: {
  locationConfirmedAt?: string | null;
  locationMode?: "fixed" | "online_only" | null;
  primaryRegions: readonly string[];
  suburb?: string | null;
  postcode?: string | null;
}): LocationNeed {
  if (brand.locationConfirmedAt === undefined) return null;
  if (brand.locationConfirmedAt === null) return "confirm";
  if (brand.locationMode === "online_only") return null;
  const hasPlace = Boolean(brand.suburb) || brand.primaryRegions.length > 0;
  if (!hasPlace) return null;
  return brand.postcode ? null : "postcode";
}
