import type { Region } from "@/db/schema/enums";

export function isFreeTierEnabled(region: Region): boolean {
  const key = `FREE_TIER_ENABLED_${region.toUpperCase()}`;
  return process.env[key] === "true";
}
