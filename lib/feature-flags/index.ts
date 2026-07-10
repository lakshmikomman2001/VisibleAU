import type { Region } from "@/db/schema/enums";
import { getOrgFlag } from "@/lib/governance/feature-flags";

export function isFreeTierEnabled(region: Region): boolean {
  const key = `FREE_TIER_ENABLED_${region.toUpperCase()}`;
  return process.env[key] === "true";
}

export async function isFreeTierEnabledForOrg(
  organizationId: string,
  region: Region,
): Promise<boolean> {
  const dbVal = await getOrgFlag(organizationId, "free_tier_enabled");
  if (dbVal !== null) return dbVal;
  return isFreeTierEnabled(region);
}

type LlmEngine = "openai" | "anthropic" | "google" | "perplexity";

export function isEngineEnabled(engine: LlmEngine): boolean {
  const key = `LLM_ENGINE_${engine.toUpperCase()}_ENABLED`;
  return process.env[key] !== "false";
}

export async function isFeatureEnabledForOrg(
  organizationId: string,
  flagKey: string,
  envFallback?: boolean,
): Promise<boolean> {
  const dbVal = await getOrgFlag(organizationId, flagKey);
  if (dbVal !== null) return dbVal;
  return envFallback ?? false;
}
