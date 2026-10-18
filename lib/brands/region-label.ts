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
