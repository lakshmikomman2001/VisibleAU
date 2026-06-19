import type { Tier } from "@/db/schema/enums";
import type { Engine, ModelTask } from "./interface";

const PRIMARY_MODELS: Record<Tier, Record<Engine, string>> = {
  free: {
    chatgpt: "gpt-4.1-mini",
    claude: "claude-haiku-4-5",
    gemini: "gemini-2.5-flash",
    perplexity: "sonar",
  },
  starter: {
    chatgpt: "gpt-4.1-mini",
    claude: "claude-haiku-4-5",
    gemini: "gemini-2.5-flash",
    perplexity: "sonar",
  },
  growth: {
    chatgpt: "gpt-4.1-mini",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-2.5-flash",
    perplexity: "sonar",
  },
  agency: {
    chatgpt: "gpt-4.1",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-2.5-pro",
    perplexity: "sonar-pro",
  },
  agency_pro: {
    chatgpt: "gpt-4.1",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-2.5-pro",
    perplexity: "sonar-pro",
  },
  enterprise: {
    chatgpt: "gpt-4.1",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-2.5-pro",
    perplexity: "sonar-pro",
  },
};

const DERIVED_TASK_MODELS: Record<Engine, string> = {
  chatgpt: "gpt-4.1-mini",
  claude: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash",
  perplexity: "sonar",
};

export function selectModel(tier: Tier, engine: Engine, task: ModelTask): string {
  if (task === "brand_mention") {
    return PRIMARY_MODELS[tier]?.[engine] ?? PRIMARY_MODELS.starter[engine];
  }
  return DERIVED_TASK_MODELS[engine];
}
