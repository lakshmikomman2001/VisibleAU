/**
 * S04 part 3 (LLD 8.4.2): what a market tells the reach code -- its country, its states or territories, how each is
 * written inside a question, and the Google location codes (DataForSEO) for each. The reach code reads places only
 * through this interface, so a market's own words live in its file (lib/markets/au.ts) and nowhere else
 * (tests/unit/reach/market-strings.test.ts).
 */

export interface MarketState {
  /** The code the brand record stores ("NSW"). */
  code: string;
  /** The full name ("New South Wales"). */
  name: string;
  /** The capital: the city ChatGPT is told for a state reach (LLD 8.4.4). */
  capital: string;
  /** How the state is written inside a question and on its reach label (LLD 8.4.2's phrasing rule). */
  inQuestion: string;
  /**
   * DataForSEO's Google location for the state: its location_name and location_code (location_type "State"). Null when
   * DataForSEO lists no such state: Google is then checked from the capital (LLD 8.4.5). Every AU state is listed.
   */
  googleLocation: { name: string; code: number } | null;
}

export interface MarketCountry {
  /** ISO 3166-1 alpha-2, as the engines' user_location takes it ("AU"). */
  code: string;
  /** "Australia" */
  name: string;
  /** "Australian" (country questions: "for {adjective} small businesses"). */
  adjective: string;
  googleLocation: { name: string; code: number };
}

export interface Market {
  /** brands.region */
  key: string;
  /** Null for a market with no data yet (the US stub). */
  country: MarketCountry | null;
  states: readonly MarketState[];
}

/** A state by its code or full name, any case; null when the market has no such state. */
export function findState(market: Market, value: string | null | undefined): MarketState | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  return (
    market.states.find((s) => s.code.toLowerCase() === v || s.name.toLowerCase() === v) ?? null
  );
}
