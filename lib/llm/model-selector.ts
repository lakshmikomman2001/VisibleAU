import type { Tier } from "@/db/schema/enums";
import type { Engine, ModelTask } from "./interface";

// S04B part 1 (LLD amendment 99): Perplexity is "sonar" on every plan. Its Agent API has no Sonar Pro -- its only own
// model is perplexity/sonar, and the migration guide maps both "`sonar` → `fast`, `sonar-pro` → `fast`"
// (https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to.md, read 28 Nov 2026) -- and Agency's Sonar Pro
// requests were already answered by Sonar (the model drift recorded since 7 Nov). lib/llm/perplexity-impl.ts.
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
    perplexity: "sonar",
  },
  agency_pro: {
    chatgpt: "gpt-4.1",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-3.5-flash-lite",
    perplexity: "sonar",
  },
  enterprise: {
    chatgpt: "gpt-4.1",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-3.5-flash-lite",
    perplexity: "sonar",
  },
};

/** Each engine client's model when its caller passes none. */
export const ENGINE_DEFAULT_MODELS: Record<Engine, string> = {
  chatgpt: "gpt-4.1-mini",
  claude: "claude-haiku-4-5",
  gemini: "gemini-3.5-flash-lite",
  perplexity: "sonar",
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

/**
 * 19 Nov (Sri's review of /pricing): the model a plan's audits ask each engine for -- selectModel's brand_mention
 * model, by plan key -- so the pricing cards and Compare plans say which models a plan gets. "4 AI engines" on every
 * paid plan hid that Starter asks Claude Haiku and Growth and up Sonnet, and Agency and up ask GPT-4.1 and Sonar Pro.
 */
export function auditModelFor(planKey: string, engine: Engine): string {
  const models = (PRIMARY_MODELS as Record<string, Record<Engine, string> | undefined>)[planKey];
  return (models ?? PRIMARY_MODELS.starter)[engine];
}
