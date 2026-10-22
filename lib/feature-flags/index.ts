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

/**
 * "Pause query simulation" (Sri's decision, 23 Oct) -- simulate-query-
 * fan-out.ts's prompt query has no .where() (picks 5 prompts from ANY
 * vertical, not the brand's own) and makes up to ~260 LLM calls/audit
 * while holding the single post-audit concurrency slot ahead of the
 * email and recommendations. Default FALSE (opt-in, unlike
 * isEngineEnabled's opt-out pattern above) -- the function stays
 * registered either way, so flipping this back to "true" needs no
 * Inngest resync. See docs/backlog/query-simulation-fix.md for the
 * real fix this unblocks.
 */
export function isQuerySimulationEnabled(): boolean {
  return process.env.QUERY_SIMULATION_ENABLED === "true";
}
