import type { QuestionReach, ReachPlace } from "@/db/schema";
import { findState, type Market } from "@/lib/markets";

/**
 * S04 part 3 (LLD 8.4.1, 8.4.2; contract reachLabels): each reach's place and how it is named.
 * - local: the brand's own suburb, city, state and postcode (its label "Local · {city}");
 * - state: the brand's state (label and question words: the market's phrasing, "NSW" or "Tasmania");
 * - country: the market's country ("Australia");
 * - global: no place ("Worldwide" to the customer, C-07).
 */

export const REACH_ORDER: readonly QuestionReach[] = ["local", "state", "country", "global"];

export const REACH_ROW_TITLES: Record<QuestionReach, string> = {
  local: "Local",
  state: "State",
  country: "Country",
  global: "Worldwide",
};

/** The brand's location fields the places are made from. */
export interface BrandPlaceFields {
  suburb: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : undefined);

/** A reach's place for a brand; null when the market can't place it (no state for the brand, or no country data). */
export function placeForReach(
  reach: QuestionReach,
  brand: BrandPlaceFields,
  market: Market,
): ReachPlace | null {
  if (reach === "local") {
    const place: ReachPlace = {
      suburb: clean(brand.suburb),
      city: clean(brand.city),
      state: clean(brand.state),
      postcode: clean(brand.postcode),
    };
    return Object.fromEntries(Object.entries(place).filter(([, v]) => v)) as ReachPlace;
  }
  if (reach === "state") {
    const state = findState(market, brand.state);
    return state ? { state: state.code } : null;
  }
  if (reach === "country") return market.country ? { country: market.country.code } : null;
  return {};
}

/** The reach's label (contract reachLabels): "Local · Sydney", "NSW", "Tasmania", "Australia", "Worldwide". */
export function reachLabel(reach: QuestionReach, place: ReachPlace, market: Market): string {
  if (reach === "local") {
    const where = place.city ?? place.suburb;
    return where ? `Local · ${where}` : "Local";
  }
  if (reach === "state") return findState(market, place.state)?.inQuestion ?? place.state ?? "";
  if (reach === "country") return market.country?.name ?? place.country ?? "";
  return REACH_ROW_TITLES.global;
}

/**
 * The words that name a reach's place inside a question (P03's place check): for a state its question word, name and
 * code; for the country its name and adjective; none for Worldwide.
 */
export function reachPlaceWords(reach: QuestionReach, place: ReachPlace, market: Market): string[] {
  if (reach === "local") return [place.suburb, place.city].filter((w): w is string => !!w);
  if (reach === "state") {
    const s = findState(market, place.state);
    return s ? [...new Set([s.inQuestion, s.name, s.code])] : [];
  }
  if (reach === "country")
    return market.country ? [market.country.name, market.country.adjective] : [];
  return [];
}

/** The reaches a market can place for a brand, in reach order (the US stub: Local and Worldwide). */
export function availableReaches(brand: BrandPlaceFields, market: Market): QuestionReach[] {
  return REACH_ORDER.filter((r) => placeForReach(r, brand, market) !== null);
}
