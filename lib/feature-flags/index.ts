import type { Region } from "@/db/schema/enums";

export function isFreeTierEnabled(region: Region): boolean {
  const key = `FREE_TIER_ENABLED_${region.toUpperCase()}`;
  return process.env[key] === "true";
}

type LlmEngine = "openai" | "anthropic" | "google" | "perplexity";

export function isEngineEnabled(engine: LlmEngine): boolean {
  const key = `LLM_ENGINE_${engine.toUpperCase()}_ENABLED`;
  return process.env[key] !== "false";
}
