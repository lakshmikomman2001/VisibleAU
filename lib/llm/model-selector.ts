import type { Tier } from "@/db/schema/enums";
import type { Engine, ModelTask } from "./interface";

// Methodology v2.2 (Sri's decision, 7 Nov), part 2: Gemini is gemini-3.5-flash-lite on every plan and task.
// gemini-2.5-flash shuts down on 1 Dec 2026, when Google starts serving its calls with 3.5 Flash-Lite at
// Flash-Lite's rates (https://aistudio.google.com/docs/deprecations, checked 7 Nov 2026); switching first
// means the answers are recorded, priced and compared as the model that gives them.
const PRIMARY_MODELS: Record<Tier, Record<Engine, string>> = {
  free: {
    chatgpt: "gpt-4.1-mini",
    claude: "claude-haiku-4-5",
    gemini: "gemini-3.5-flash-lite",
    perplexity: "sonar",
  },
  starter: {
    chatgpt: "gpt-4.1-mini",
    claude: "claude-haiku-4-5",
    gemini: "gemini-3.5-flash-lite",
    perplexity: "sonar",
  },
  growth: {
    chatgpt: "gpt-4.1-mini",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-3.5-flash-lite",
    perplexity: "sonar",
  },
  agency: {
    chatgpt: "gpt-4.1",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-3.5-flash-lite",
    perplexity: "sonar-pro",
  },
  agency_pro: {
    chatgpt: "gpt-4.1",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-3.5-flash-lite",
    perplexity: "sonar-pro",
  },
  enterprise: {
    chatgpt: "gpt-4.1",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-3.5-flash-lite",
    perplexity: "sonar-pro",
  },
};

/** Each engine client's model when its caller passes none. */
export const ENGINE_DEFAULT_MODELS: Record<Engine, string> = {
  chatgpt: "gpt-4.1-mini",
  claude: "claude-haiku-4-5",
  gemini: "gemini-3.5-flash-lite",
  perplexity: "sonar-pro",
};

const DERIVED_TASK_MODELS: Record<Engine, string> = {
  chatgpt: "gpt-4.1-mini",
  claude: "claude-haiku-4-5",
  gemini: "gemini-3.5-flash-lite",
  perplexity: "sonar",
};

export function selectModel(tier: Tier, engine: Engine, task: ModelTask): string {
  if (task === "brand_mention") {
    return PRIMARY_MODELS[tier]?.[engine] ?? PRIMARY_MODELS.starter[engine];
  }
  return DERIVED_TASK_MODELS[engine];
}
