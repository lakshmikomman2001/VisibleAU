import type { Market } from "./types";

/**
 * S04 part 3 (LLD 8.4.2): Australia, the one market with data. The only place the reach code's Australian words live.
 *
 * - States and territories with their capitals (NSW -> Sydney, VIC -> Melbourne, QLD -> Brisbane, WA -> Perth,
 *   SA -> Adelaide, TAS -> Hobart, ACT -> Canberra, NT -> Darwin).
 * - Phrasing rule: inside a question a state is written as its abbreviation -- "NSW", "VIC", "QLD", "WA", "SA", "ACT",
 *   "NT" -- except Tasmania, written in full ("Tasmania"). Change `inQuestion` to change it.
 * - Google locations (DataForSEO's Google list, the 2 Nov 2026 file, checked 27 Nov 2026: each state is a location of
 *   type "State" under Australia, 2036): lib/llm/reach-location-params.ts quotes the source. The same codes are in
 *   lib/google-surfaces/data/dataforseo-au-locations.json (states) -- a test holds the two equal.
 */
export const AU_MARKET: Market = {
  key: "au",
  country: {
    code: "AU",
    name: "Australia",
    adjective: "Australian",
    googleLocation: { name: "Australia", code: 2036 },
  },
  states: [
    {
      code: "NSW",
      name: "New South Wales",
      capital: "Sydney",
      inQuestion: "NSW",
      googleLocation: { name: "New South Wales,Australia", code: 20035 },
    },
    {
      code: "VIC",
      name: "Victoria",
      capital: "Melbourne",
      inQuestion: "VIC",
      googleLocation: { name: "Victoria,Australia", code: 20040 },
    },
    {
      code: "QLD",
      name: "Queensland",
      capital: "Brisbane",
      inQuestion: "QLD",
      googleLocation: { name: "Queensland,Australia", code: 20037 },
    },
    {
      code: "WA",
      name: "Western Australia",
      capital: "Perth",
      inQuestion: "WA",
      googleLocation: { name: "Western Australia,Australia", code: 20041 },
    },
    {
      code: "SA",
      name: "South Australia",
      capital: "Adelaide",
      inQuestion: "SA",
      googleLocation: { name: "South Australia,Australia", code: 20038 },
    },
    {
      code: "TAS",
      name: "Tasmania",
      capital: "Hobart",
      inQuestion: "Tasmania",
      googleLocation: { name: "Tasmania,Australia", code: 20039 },
    },
    {
      code: "ACT",
      name: "Australian Capital Territory",
      capital: "Canberra",
      inQuestion: "ACT",
      googleLocation: { name: "Australian Capital Territory,Australia", code: 20034 },
    },
    {
      code: "NT",
      name: "Northern Territory",
      capital: "Darwin",
      inQuestion: "NT",
      googleLocation: { name: "Northern Territory,Australia", code: 20036 },
    },
  ],
};
