/**
 * S04 part 1 (LLD 8.4.4, 8.4.5; amendment 18): the location each engine's web search can be told, confirmed from each
 * provider's current documentation on 27 Nov 2026. Nothing reads this yet (no product change in part 1); part 4 sets
 * the location per reach from it, and part 5 Google's.
 *
 * ChatGPT -- OpenAI Responses API, `web_search` tool, `user_location`
 *   https://developers.openai.com/api/docs/guides/tools-web-search
 *   "To refine search results based on geography, you can specify an approximate user location using country, city,
 *   region, and/or timezone." "The `country` field is a two-letter ISO country code ... like `US`." "The `city` and
 *   `region` fields are free text strings, like `Minneapolis` ..." (example: { type: "approximate", country: "GB",
 *   city: "London", region: "London" }). Sent today through @ai-sdk/openai's `userLocation` (lib/llm/openai-impl.ts).
 *   Whether country alone may be sent isn't stated; the "and/or" allows it.
 *
 * Claude -- Anthropic web search tool `web_search_20250305` (the one we use; the page also lists web_search_20260209
 *   and web_search_20260318), `user_location`
 *   https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
 *   "`type`: The type of location (must be `approximate`)", "`city`: The city name", "`region`: The region or state",
 *   "`country`: The two-letter ISO 3166-1 alpha-2 country code (the API rejects an unsupported code with a 400
 *   error)", "Provide at least one of `city`, `region`, `country`, or `timezone`." So country alone, or region and
 *   country without a city, are valid. Sent today through @ai-sdk/anthropic's `userLocation` (anthropic-impl.ts).
 *
 * Perplexity -- none in our integration. Its current docs document `user_location` (country, region, city, latitude,
 *   longitude) only on the Agent API's `web_search` tool:
 *   https://docs.perplexity.ai/docs/agent-api/tools/web-search ("`user_location` | object | Personalize search by
 *   country, region, city, latitude, and longitude.")
 *   We call Sonar chat completions (lib/llm/perplexity-impl.ts, https://api.perplexity.ai/chat/completions), whose
 *   `web_search_options.user_location` the migration page only maps to the Agent API's
 *   (https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to.md); the Sonar schema itself is no longer
 *   documented ("Sonar Chat Completions support ended on September 27, 2026.",
 *   https://docs.perplexity.ai/api-reference/chat-completions-post). So Perplexity gets the place in the words only.
 *
 * Gemini -- none. The `google_search` grounding tool takes no arguments and the page mentions no location:
 *   https://aistudio.google.com/docs/google-search (redirected from ai.google.dev/gemini-api/docs/google-search).
 *   A latitude/longitude is documented only for the separate `google_maps` tool
 *   (https://aistudio.google.com/docs/maps-grounding), which we don't use. The place goes in the words only.
 *
 * Google AI (DataForSEO, part 5) -- states exist in the provider's Google locations list as location_type "State",
 *   children of Australia (2036): https://docs.dataforseo.com/v3/serp/google/locations/ links
 *   https://cdn.dataforseo.com/v3/locations/locations_serp_google_2026_11_02.csv (still the newest on 27 Nov 2026),
 *   whose rows include "20035,"New South Wales,Australia",2036,AU,State"; the other seven states and territories are
 *   20034 (ACT), 20036 (NT), 20037 (QLD), 20038 (SA), 20039 (Tasmania), 20040 (Victoria) and 20041 (WA). AI Mode
 *   uses the same list (its location_code and location_name point to /v3/serp/google/locations). Our cached copy,
 *   lib/google-surfaces/data/dataforseo-au-locations.json, has these codes; part 3 puts them in lib/markets/au.ts
 *   (market data lives only there).
 */

export type ReachKey = "local" | "state" | "country" | "global";

/** What an engine's web search can be told, by field. `none`: the place goes in the question's words only. */
export const ENGINE_LOCATION_FIELDS = {
  chatgpt: ["city", "region", "country"],
  claude: ["city", "region", "country"],
  perplexity: [],
  gemini: [],
} as const satisfies Record<string, readonly ("city" | "region" | "country")[]>;

/**
 * The table that drives part 4 (LLD 8.4.4 as confirmed): which fields each reach sends to ChatGPT and Claude. Local is
 * today's payload (lib/brands/region-label.ts buildEngineLocation: city, state, "AU", only for a confirmed fixed
 * location with a city). State sends the state and the country, plus the capital as the city for ChatGPT (LLD 8.4.4;
 * OpenAI's examples always pair city and region); Country sends "AU" alone; Worldwide sends nothing.
 */
export const REACH_LOCATION_FIELDS: Record<
  ReachKey,
  { chatgpt: readonly string[]; claude: readonly string[] }
> = {
  local: { chatgpt: ["city", "region", "country"], claude: ["city", "region", "country"] },
  state: { chatgpt: ["city (the capital)", "region", "country"], claude: ["region", "country"] },
  country: { chatgpt: ["country"], claude: ["country"] },
  global: { chatgpt: [], claude: [] },
};
