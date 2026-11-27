import type { QuestionReach } from "@/db/schema";
import { resolveGoogleLocation } from "@/lib/google-surfaces/location";
import { findState, type MarketState, marketFor } from "@/lib/markets";

/**
 * S04 part 5 (LLD 8.4.5; D-QI7): where Google AI Overviews and AI Mode are checked for a question, by its reach.
 * - local: as today (the audit's own location: postcode, suburb, city or state capital, labelled);
 * - state: DataForSEO's location for the state (part 1: every AU state is listed); a state it doesn't list is checked
 *   from its capital, labelled "Sydney, as NSW" (the Google section: "Checked from Sydney, as NSW");
 * - country: the country;
 * - global: not run ("Worldwide questions are measured on the four AI engines only.").
 * Null when it isn't run, or the market can't place the reach.
 */

export const WORLDWIDE_GOOGLE_NOTE =
  "Worldwide questions are measured on the four AI engines only.";

export interface GoogleTarget {
  code: number;
  label: string;
}

/** What the Google section prints for where a reach's questions were checked. */
export function checkedFromText(label: string): string {
  return `Checked from ${label}`;
}

/** A state reach's Google location: the state's own, else its capital's, labelled as standing in for the state. */
export function googleLocationForState(state: MarketState): GoogleTarget | null {
  if (state.googleLocation) return { code: state.googleLocation.code, label: state.inQuestion };
  const capital = resolveGoogleLocation({
    postcode: null,
    suburb: null,
    city: state.capital,
    state: state.code,
    locationMode: null,
  });
  return capital.ok
    ? { code: capital.location.code, label: `${state.capital}, as ${state.inQuestion}` }
    : null;
}

export function googleLocationForReach(
  reach: QuestionReach | undefined,
  brand: { state: string | null; region: string | null },
  local: GoogleTarget,
): GoogleTarget | null {
  if (!reach || reach === "local") return { code: local.code, label: local.label };
  if (reach === "global") return null;
  const market = marketFor(brand.region);
  if (reach === "country") {
    const c = market.country;
    return c ? { code: c.googleLocation.code, label: c.name } : null;
  }
  const state = findState(market, brand.state);
  return state ? googleLocationForState(state) : null;
}
