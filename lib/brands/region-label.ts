import type { Brand } from "@/db/schema";

const REGION_DISPLAY: Record<string, string> = {
  au: "Australia",
  nz: "New Zealand",
  uk: "United Kingdom",
  us: "United States",
  ca: "Canada",
  eu: "Europe",
};

/**
 * Vunnara Build 1, Part D.5: the text that fills a prompt template's
 * {region} placeholder. The confirmed suburb wins, then the confirmed
 * city, then the legacy "STATE:Suburb" primaryRegions[0] (brands that
 * predate Part D's required-location flow), then a plain region name
 * -- never a fabricated suburb. One function, used by both audit
 * runners (run-audit-inline.ts and inngest/functions/run-audit.ts),
 * which had each grown their own copy of this fallback chain.
 */
export function resolveRegionLabel(
  brand: Pick<Brand, "suburb" | "city" | "primaryRegions" | "region">,
): string {
  return (
    brand.suburb ??
    brand.city ??
    brand.primaryRegions[0]?.replace(/^[A-Z]+:/, "") ??
    REGION_DISPLAY[brand.region] ??
    "Australia"
  );
}

/**
 * Vunnara Build 1, Part G.3: the approximate location passed to an
 * engine's web search tool (chatgpt/claude only -- see docs/ops/web-
 * search-engines.md for why Gemini never gets this). Only returned
 * when the brand has an actually-confirmed FIXED location -- never
 * guessed from an unconfirmed default, and never sent at all for an
 * online-only brand (there's no real city to bias search toward).
 * country is hardcoded "AU" since this product is AU-only today
 * (brands.country stores the display string "Australia", not a
 * 2-letter code the providers require).
 */
export function buildEngineLocation(
  brand: Pick<Brand, "locationMode" | "locationConfirmedAt" | "city" | "state">,
): { city?: string; region?: string; country?: string } | undefined {
  if (brand.locationMode !== "fixed") return undefined;
  if (!brand.locationConfirmedAt) return undefined;
  if (!brand.city) return undefined;
  return {
    city: brand.city,
    region: brand.state ?? undefined,
    country: "AU",
  };
}
