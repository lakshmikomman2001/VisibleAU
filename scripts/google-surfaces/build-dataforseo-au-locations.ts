/**
 * Google AI surfaces, Phase 1, part 2 -- builds lib/google-surfaces/data/dataforseo-au-locations.json, the
 * cached copy of the provider's Australian locations, from DataForSEO's public locations list (the same list
 * its /v3/serp/google/locations endpoint returns; AI Mode has no list of its own: the 11 Nov live sample got
 * 404 for /ai_mode/locations, and AI Mode accepted 9071744 "2153,New South Wales,Australia").
 *
 * Usage: download the CSV (public, no credentials; the research doc cites the 2 Nov 2026 file), then
 *   npx tsx scripts/google-surfaces/build-dataforseo-au-locations.ts <path to locations_serp_google_*.csv> <source url>
 * Keeps the postcodes, the cities/suburbs, the states and the country; nothing else.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [csvPath, sourceUrl] = process.argv.slice(2);
if (!csvPath || !sourceUrl) {
  console.error("usage: build-dataforseo-au-locations.ts <csv path> <source url>");
  process.exit(1);
}

/** One CSV line into its fields (double-quoted fields may hold commas). */
function fields(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  "Australian Capital Territory": "ACT",
  "New South Wales": "NSW",
  "Northern Territory": "NT",
  Queensland: "QLD",
  "South Australia": "SA",
  Tasmania: "TAS",
  Victoria: "VIC",
  "Western Australia": "WA",
};

const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean);
const header = fields(lines[0]);
const col = (name: string) => header.indexOf(name);
const [CODE, NAME, PARENT, COUNTRY, TYPE] = [
  col("location_code"),
  col("location_name"),
  col("location_code_parent"),
  col("country_iso_code"),
  col("location_type"),
];

const states: Record<string, number> = {};
const postcodes: Record<string, [number, string]> = {};
const places: Record<string, Record<string, number>> = {};
let country: number | null = null;
let rows = 0;

for (const line of lines.slice(1)) {
  const f = fields(line);
  if (f[COUNTRY] !== "AU") continue;
  rows++;
  const code = Number(f[CODE]);
  const parts = f[NAME].split(",");
  const type = f[TYPE];
  if (type === "Country") country = code;
  if (type === "State") {
    const abbr = STATE_ABBREVIATIONS[parts[0]];
    if (abbr) states[abbr] = code;
  }
  // "2153,New South Wales,Australia" / "Bella Vista,New South Wales,Australia": the state is the
  // second-to-last part.
  const state = STATE_ABBREVIATIONS[parts[parts.length - 2] ?? ""];
  if (!state) continue;
  if (type === "Postal Code" && /^\d{4}$/.test(parts[0])) postcodes[parts[0]] = [code, state];
  if (type === "City") {
    places[state] ??= {};
    // The three-part name ("Sydney,New South Wales,Australia") wins over a longer one with the same first part.
    if (parts.length === 3 || places[state][parts[0]] === undefined) places[state][parts[0]] = code;
  }
  void f[PARENT];
}

const out = {
  source: sourceUrl,
  note: "DataForSEO's Google locations (Google's geotargets), Australian rows only: postcodes, cities and suburbs, states.",
  rows,
  country,
  states,
  postcodes,
  places,
};
const target = join(process.cwd(), "lib/google-surfaces/data/dataforseo-au-locations.json");
writeFileSync(target, `${JSON.stringify(out)}\n`);
console.log(
  `${rows} Australian rows: ${Object.keys(postcodes).length} postcodes, ${Object.values(places).reduce((n, p) => n + Object.keys(p).length, 0)} places, ${Object.keys(states).length} states -> ${target}`,
);
