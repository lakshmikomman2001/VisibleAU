import { AU_MARKET } from "./au";
import type { Market } from "./types";
import { US_MARKET } from "./us";

export { findState, type Market, type MarketCountry, type MarketState } from "./types";

const MARKETS: Record<string, Market> = { au: AU_MARKET, us: US_MARKET };

/** The market for a brand's region (brands.region); a region with no market file gets an empty one, like the US stub. */
export function marketFor(region: string | null | undefined): Market {
  return MARKETS[region ?? ""] ?? { key: region ?? "", country: null, states: [] };
}
