import type { Brand, QuestionReach } from "@/db/schema";
import { buildEngineLocation } from "@/lib/brands/region-label";
import type { Engine } from "@/lib/llm/interface";
import { findState, marketFor } from "@/lib/markets";

/**
 * S04 part 4 (LLD 8.4.4, as part 1 confirmed: lib/llm/reach-location-params.ts): the location an engine's web search is
 * told for a question, by the question's reach. ChatGPT, Claude and, from S04B, Perplexity take one (Gemini: the place
 * is in the words only).
 * - local: today's, unchanged (buildEngineLocation: city, state, the country -- only for a confirmed fixed location
 *   with a city);
 * - state: the state's name and the country, and for ChatGPT the capital as the city (LLD 8.4.4; Claude and
 *   Perplexity: no city);
 * - country: the country alone;
 * - global ("Worldwide"): none.
 * A market that can't place the reach (the US stub; a brand with no state) gives none.
 */

export interface EngineLocation {
  city?: string;
  region?: string;
  country?: string;
}

type LocationBrand = Pick<
  Brand,
  "locationMode" | "locationConfirmedAt" | "city" | "state" | "region"
>;

// S04B part 1 (LLD amendment 99): Perplexity's Agent API web_search takes a user_location (country, region, city), so
// Perplexity is told the reach's location as Claude is (the state's name and the country for State).
const TAKES_LOCATION: ReadonlySet<string> = new Set(["chatgpt", "claude", "perplexity"]);

export function engineLocationForReach(
  reach: QuestionReach | undefined,
  engine: Engine | string,
  brand: LocationBrand,
): EngineLocation | undefined {
  if (!reach || reach === "local") return buildEngineLocation(brand);
  if (!TAKES_LOCATION.has(engine) || reach === "global") return undefined;
  const market = marketFor(brand.region);
  const country = market.country?.code;
  if (!country) return undefined;
  if (reach === "country") return { country };
  const state = findState(market, brand.state);
  if (!state) return undefined;
  return engine === "chatgpt"
    ? { city: state.capital, region: state.name, country }
    : { region: state.name, country };
}

/**
 * The answer cache's scope for a question beyond Local (LLD 8.4.4: "Cache keys for answers include the reach and
 * location so a Local answer is never replayed for a Country question"). None for Local, so every Local key -- and
 * every answer cached before S04 -- stays exactly as it was (lib/llm/cache.ts makeKey).
 */
export function answerCacheScope(
  reach: QuestionReach | undefined,
  location: EngineLocation | undefined,
): string | undefined {
  if (!reach || reach === "local") return undefined;
  const where = location
    ? `${location.city ?? ""}|${location.region ?? ""}|${location.country ?? ""}`
    : "";
  return `reach=${reach};location=${where}`;
}

/**
 * What both audit runners add to an engine call for a question (lib/audit/run-audit-inline.ts,
 * inngest/functions/run-audit.ts): its location and, beyond Local, the cache scope. A Local question gets exactly what
 * it got before S04: buildEngineLocation's location and no scope.
 */
export function engineCallReach(
  reach: QuestionReach | undefined,
  engine: Engine | string,
  brand: LocationBrand,
): { location?: EngineLocation; cacheScope?: string } {
  const location = engineLocationForReach(reach, engine, brand);
  const cacheScope = answerCacheScope(reach, location);
  return { location, ...(cacheScope ? { cacheScope } : {}) };
}
