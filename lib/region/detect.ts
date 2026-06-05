import type { Region } from "@/db/schema/enums";

export function detectRegion({
  pathname,
  geoCountry,
}: {
  pathname: string;
  geoCountry?: string;
}): Region {
  const match = pathname.match(/^\/(au|nz|uk|us|ca|eu)(\/|$)/);
  if (match) return match[1] as Region;

  const map: Record<string, Region> = {
    AU: "au",
    NZ: "nz",
    GB: "uk",
    US: "us",
    CA: "ca",
  };
  if (geoCountry && map[geoCountry]) return map[geoCountry];

  const euCountries = [
    "DE",
    "FR",
    "IT",
    "ES",
    "NL",
    "BE",
    "PL",
    "SE",
    "AT",
    "DK",
    "FI",
    "IE",
    "PT",
    "GR",
    "CZ",
    "RO",
    "HU",
  ];
  if (geoCountry && euCountries.includes(geoCountry)) return "eu";

  return "au";
}
