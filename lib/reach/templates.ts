/**
 * S04 part 3 (LLD 8.4.3): the question families for the reaches beyond Local, one for every business type before S05's
 * taxonomy: each fills {phrase} with the business's service phrase -- the same words the brand's own questions use
 * ("a plumber", "managed IT services": lib/prompts/build-prompt-pack.ts servicePhraseFor) -- and names its place in the
 * words ({state}, {country}, {adjective}: the market's, lib/markets), because Gemini can't be told a location. Worldwide
 * questions name no place. Local keeps the brand's own questions, exactly as today.
 *
 * Households' questions come first for a households business, businesses' first for a business one; "both" alternates.
 * No market's words appear here (tests/unit/reach/market-strings.test.ts).
 */

export interface ReachFamily {
  households: readonly string[];
  businesses: readonly string[];
}

export const STATE_FAMILY: ReachFamily = {
  households: [
    "Can you recommend {phrase} in {state}?",
    "Who is the best choice for {phrase} in {state}?",
    "What are the top options for {phrase} in {state}?",
    "Where can I find {phrase} in {state}?",
    "Who do people in {state} trust for {phrase}?",
    "Who should I call for {phrase} in {state}?",
    "Who has the best reviews for {phrase} in {state}?",
    "Which options for {phrase} in {state} offer good value?",
  ],
  businesses: [
    "Can you recommend {phrase} for small businesses in {state}?",
    "What are the top options for {phrase} for small businesses in {state}?",
    "Who do businesses in {state} trust for {phrase}?",
    "Who is the best choice for {phrase} for a business in {state}?",
  ],
};

export const COUNTRY_FAMILY: ReachFamily = {
  households: [
    "Can you recommend {phrase} in {country}?",
    "Who is the best choice for {phrase} in {country}?",
    "What are the top options for {phrase} in {country}?",
    "Where can I find {phrase} anywhere in {country}?",
    "Who do {adjective} customers trust for {phrase}?",
    "Who should I call for {phrase} in {country}?",
    "Who has the best reviews for {phrase} in {country}?",
    "Which options for {phrase} in {country} offer good value?",
  ],
  businesses: [
    "Can you recommend {phrase} for {adjective} small businesses?",
    "What are the top options for {phrase} for {adjective} businesses?",
    "Who do {adjective} businesses trust for {phrase}?",
    "Who is the best choice for {phrase} for a business in {country}?",
  ],
};

export const GLOBAL_FAMILY: ReachFamily = {
  households: [
    "Can you recommend {phrase}?",
    "Who is the best choice for {phrase}?",
    "What are the top options for {phrase}?",
    "Which providers are most recommended for {phrase}?",
    "Who has the best reviews for {phrase}?",
    "Who should I call for {phrase}?",
    "Who do customers trust most for {phrase}?",
    "Which options for {phrase} offer good value?",
  ],
  businesses: [
    "Can you recommend {phrase} for small businesses?",
    "What are the top options for {phrase} for small businesses?",
    "Who do businesses trust most for {phrase}?",
    "Who is the best choice for {phrase} for a business?",
  ],
};
