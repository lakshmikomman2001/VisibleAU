import type { Market } from "./types";

/**
 * S04 part 3 (LLD 8.4.2): the United States -- a stub with the same interface and no data, filled when the US launches.
 * With no country and no states, the reach code offers only Local and Worldwide for it.
 */
export const US_MARKET: Market = {
  key: "us",
  country: null,
  states: [],
};
